import type { CoachingReport } from "@/types/delivery";

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-cloud/40 p-5">
      <p className="text-sm font-semibold text-slate">{label}</p>
      <p className="mt-3 text-4xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate">out of 10</p>
    </div>
  );
}

export function ReportView({ report }: { report: CoachingReport }) {
  const showExactTimestamps = !report.processingNotes.transcriptConfidence.toLowerCase().includes("approximate");

  return (
    <div className="space-y-8">
      <div className="panel p-8">
        <p className="eyebrow">Executive Summary</p>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <p className="text-lg leading-8 text-ink">{report.executiveSummary}</p>
          </div>
          <div className="rounded-3xl bg-ink p-6 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Overall Delivery Score</p>
            <p className="mt-4 text-6xl font-semibold">{report.overallScore}</p>
            <p className="mt-2 text-sm text-white/75">A first-pass score derived from transcript signals and any visual cues available.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScoreCard label="Voice & Pacing" value={report.dimensionScores.voicePacing} />
        <ScoreCard label="Presence & Confidence" value={report.dimensionScores.presenceConfidence} />
        <ScoreCard label="Body Language" value={report.dimensionScores.bodyLanguage} />
        <ScoreCard label="Audience Engagement" value={report.dimensionScores.audienceEngagement} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="panel p-6">
          <p className="eyebrow">Top 3 Strengths</p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-ink">
            {report.topStrengths.map((item) => (
              <li key={item} className="rounded-2xl border border-line bg-cloud/40 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-6">
          <p className="eyebrow">Top 3 Priority Fixes</p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-ink">
            {report.topPriorityFixes.map((item) => (
              <li key={item} className="rounded-2xl border border-line bg-white px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel p-6">
        <p className="eyebrow">Timestamped Coaching Moments</p>
        <div className="mt-4 space-y-4">
          {report.coachingMoments.map((moment) => (
            <div key={`${moment.timestamp}-${moment.title}`} className="rounded-3xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {showExactTimestamps && moment.timestamp.trim().length > 0 ? (
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/65">{moment.timestamp}</p>
                  ) : null}
                  <h3 className="mt-2 text-xl font-semibold text-ink">{moment.title}</h3>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                    moment.severity === "high"
                      ? "bg-danger/10 text-danger"
                      : moment.severity === "medium"
                        ? "bg-warning/10 text-warning"
                        : "bg-success/10 text-success"
                  }`}
                >
                  {moment.severity}
                </span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">Observation</p>
                  <p className="mt-2 text-sm leading-7 text-ink">{moment.observation}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">Why it matters</p>
                  <p className="mt-2 text-sm leading-7 text-ink">{moment.whyItMatters}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">Coaching tip</p>
                  <p className="mt-2 text-sm leading-7 text-ink">{moment.coachingTip}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="panel p-6">
          <p className="eyebrow">Recommended Practice Plan</p>
          <div className="mt-4 space-y-4">
            {report.practicePlan.map((item) => (
              <div key={item.focusArea} className="rounded-2xl border border-line bg-cloud/40 p-4">
                <h3 className="text-lg font-semibold text-ink">{item.focusArea}</h3>
                <p className="mt-3 text-sm leading-7 text-ink">{item.exercise}</p>
                <div className="mt-3 grid gap-2 text-sm text-slate md:grid-cols-2">
                  <p>
                    <span className="font-semibold text-ink">Frequency:</span> {item.frequency}
                  </p>
                  <p>
                    <span className="font-semibold text-ink">Goal:</span> {item.goal}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-6">
          <p className="eyebrow">Processing Notes</p>
          <div className="mt-4 space-y-4 text-sm leading-7 text-ink">
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="font-semibold">Transcript confidence</p>
              <p className="mt-2">{report.processingNotes.transcriptConfidence}</p>
            </div>
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="font-semibold">Visual confidence</p>
              <p className="mt-2">{report.processingNotes.visualConfidence}</p>
            </div>
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="font-semibold">Limitations</p>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {report.processingNotes.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
