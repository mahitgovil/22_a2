-- [Assignment 2 addition] Contract lifecycle helpers used by the front end.
--
-- Allowed transitions:  FUNDED -> IN PROGRESS -> COMPLETED
--
-- The "one active contract per freelancer" rule is NOT re-implemented here:
-- it is still enforced only by the Part A partial unique index
-- idx_active_gig (contracts(freelancer_id) WHERE status = 'IN PROGRESS').
-- If a second contract for the same freelancer is moved to IN PROGRESS, the
-- index raises unique_violation (SQLSTATE 23505) and the API turns it into a
-- friendly message.

CREATE OR REPLACE FUNCTION fn_advance_contract_status(
    p_contract_id BIGINT,
    p_new_status  VARCHAR(20)
)
RETURNS contracts
LANGUAGE plpgsql
AS $$
DECLARE
    v_contract contracts;
BEGIN
    SELECT * INTO v_contract
      FROM contracts
     WHERE id = p_contract_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contract % does not exist', p_contract_id;
    END IF;

    IF NOT (
        (v_contract.status = 'FUNDED'      AND p_new_status = 'IN PROGRESS') OR
        (v_contract.status = 'IN PROGRESS' AND p_new_status = 'COMPLETED')
    ) THEN
        RAISE EXCEPTION 'Invalid status change: % -> %',
            v_contract.status, p_new_status;
    END IF;

    UPDATE contracts
       SET status = p_new_status
     WHERE id = p_contract_id
    RETURNING * INTO v_contract;

    RETURN v_contract;
END;
$$;


-- Variant of Workflow 1 that funds a gig AND starts it immediately.
-- It performs exactly the same steps as sp_execute_gig_funding, but inserts
-- the contract as 'IN PROGRESS'. If the freelancer already has an active
-- contract, the partial unique index aborts the INSERT, and because the
-- escrow deduction happened in the same transaction it is rolled back too:
-- the client's balance and the audit log are left unchanged.
DROP PROCEDURE IF EXISTS sp_execute_gig_funding_and_start(BIGINT, BIGINT, NUMERIC);

CREATE OR REPLACE PROCEDURE sp_execute_gig_funding_and_start(
    p_client_id     BIGINT,
    p_freelancer_id BIGINT,
    p_budget        NUMERIC(12,2)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance NUMERIC(12,2);
BEGIN
    IF p_budget IS NULL OR p_budget <= 0 THEN
        RAISE EXCEPTION 'Budget must be greater than zero';
    END IF;

    SELECT escrow_balance INTO v_balance
      FROM clients
     WHERE id = p_client_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Client % does not exist', p_client_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM freelancers WHERE id = p_freelancer_id) THEN
        RAISE EXCEPTION 'Freelancer % does not exist', p_freelancer_id;
    END IF;

    IF v_balance < p_budget THEN
        RAISE EXCEPTION
            'Insufficient escrow balance: balance=%, requested=%',
            v_balance, p_budget;
    END IF;

    UPDATE clients
       SET escrow_balance = escrow_balance - p_budget
     WHERE id = p_client_id;

    INSERT INTO contracts (client_id, freelancer_id, budget, status)
    VALUES (p_client_id, p_freelancer_id, p_budget, 'IN PROGRESS');

    COMMIT;
END;
$$;
