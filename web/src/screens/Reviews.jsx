import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../hooks.js';
import { Async, Card, Empty, FreelancerPicker, Pager, Stat } from '../components/ui.jsx';
import { BarChart, COLORS } from '../components/charts.jsx';
import { dateOnly, num } from '../format.js';
import { Portfolio } from './Browse.jsx';

export default function Reviews() {
  const [freelancerId, setFreelancerId] = useState(null);
  const analytics = useAsync(() => api('/reviews/analytics', { params: { freelancerId } }), [freelancerId]);

  return (
    <>
      <Card title="Review analytics">
        <div className="filters">
          <FreelancerPicker value={freelancerId} onChange={(id) => setFreelancerId(id)} allowNone noneLabel="All freelancers" label="Show reviews for" />
        </div>
        <Async
          state={analytics}
          isEmpty={(d) => d.review_count === 0}
          empty={<Empty title="No reviews yet">This freelancer has not been reviewed. Choose another freelancer or show all.</Empty>}
        >
          {(d) => (
            <>
              <div className="stats">
                <Stat label="Average rating" value={`${d.average_rating.toFixed(2)} / 5`} />
                <Stat label="Reviews" value={num(d.review_count)} />
                <Stat label="Most mentioned skill" value={d.top_skill_tags[0]?.tag ?? '–'} note={d.top_skill_tags[0] ? `${num(d.top_skill_tags[0].count)} reviews` : undefined} />
              </div>
              <div className="two-col even">
                <div>
                  <h3>Rating distribution</h3>
                  <BarChart
                    label="Number of reviews at each star rating"
                    labels={d.rating_distribution.map((r) => `${r.rating} ${r.rating === 1 ? 'star' : 'stars'}`)}
                    data={d.rating_distribution.map((r) => r.count)}
                    datasetLabel="Reviews"
                  />
                </div>
                <div>
                  <h3>Top skill tags</h3>
                  <BarChart
                    horizontal
                    color={COLORS.green}
                    height={Math.max(260, d.top_skill_tags.length * 26)}
                    label="Most frequent skill tags in reviews"
                    labels={d.top_skill_tags.map((t) => t.tag)}
                    data={d.top_skill_tags.map((t) => t.count)}
                    datasetLabel="Reviews"
                  />
                </div>
              </div>
            </>
          )}
        </Async>
      </Card>

      <LatestReviews freelancerId={freelancerId} />
      <PortfolioCard />
    </>
  );
}

function Stars({ n }) {
  return <span className="stars" role="img" aria-label={`${n} out of 5`}>{'★'.repeat(n)}<span className="off">{'★'.repeat(5 - n)}</span></span>;
}

function LatestReviews({ freelancerId }) {
  const [page, setPage] = useState(1);
  const [last, setLast] = useState(freelancerId);
  if (last !== freelancerId) { setLast(freelancerId); setPage(1); }
  const state = useAsync(() => api('/reviews', { params: { freelancerId, page, pageSize: 6 } }), [freelancerId, page]);
  return (
    <Card title="Latest reviews">
      <Async state={state} isEmpty={(d) => d.items.length === 0} empty={<Empty title="No reviews to show">Nothing has been reviewed yet.</Empty>} rows={4}>
        {(d) => (
          <>
            <ul className="review-list">
              {d.items.map((r) => (
                <li key={r._id}>
                  <div className="review-head">
                    <Stars n={r.rating} />
                    <span className="muted">Freelancer #{r.freelancer_id} · {dateOnly(r.created_at)}</span>
                  </div>
                  {r.comment && <p>{r.comment}</p>}
                  <div className="chips">{r.skill_tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>
                </li>
              ))}
            </ul>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </Async>
    </Card>
  );
}

function PortfolioCard() {
  const [id, setId] = useState(1);
  const state = useAsync(() => (id ? api(`/portfolios/${id}`) : Promise.resolve(null)), [id]);
  return (
    <Card title="Freelancer portfolio (flexible document)">
      <p className="muted">Portfolios are stored as free-form documents, so each freelancer can have different sections.</p>
      <div className="filters">
        <FreelancerPicker value={id} onChange={(v) => setId(v)} label="Portfolio of" />
      </div>
      {!id && <Empty title="Choose a freelancer">Search by name or ID to read their portfolio.</Empty>}
      {id && (
        state.error && state.error.status === 404
          ? <Empty title="No portfolio on file">This freelancer has not added a portfolio.</Empty>
          : <Async state={state}>{(doc) => <Portfolio doc={doc} />}</Async>
      )}
    </Card>
  );
}
