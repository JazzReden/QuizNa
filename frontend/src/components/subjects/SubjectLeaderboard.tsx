import { EmptyState } from "../common/WorkspaceUi";
import type { SubjectRanking } from "../../types";
export function SubjectLeaderboard({ rows }: { rows: SubjectRanking[] }) {
  return (
    <section className="qn-catalog">
      <p className="qn-subject-note">
        Confirmed, released scores · best result per quiz
      </p>
      {!rows.length ? (
        <EmptyState
          title="No released scores yet"
          description="Rankings appear after scores are confirmed and released."
        />
      ) : (
        <div className="qn-subject-table">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Student</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student_id}>
                  <td>{r.rank}</td>
                  <th scope="row">{r.name}</th>
                  <td>
                    {r.score}/{r.max_score}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
