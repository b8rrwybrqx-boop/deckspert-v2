import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { postJson } from "../../src/api";
import { useAuth } from "../../src/auth/useAuth";

type CoachDiagnosis = {
  issueType: "bigIdea" | "situation" | "rootCause" | "wiifm" | "ask" | "flow" | "audience" | "general";
  summary: string;
  likelyCauses: string[];
  suggestedFixes: string[];
};

type CoachReframe = {
  label: string;
  text: string;
  whyItWorks: string;
};

type DoctrineHighlight = {
  title: string;
  guidance: string;
};

type CoachResponse = {
  reply: string;
  diagnosis?: CoachDiagnosis;
  reframes: CoachReframe[];
  doctrineHighlights: DoctrineHighlight[];
  suggestedQuestions: string[];
  suggestedNextStep?: string;
};

type Message = {
  role: "assistant" | "user";
  text: string;
  diagnosis?: CoachDiagnosis;
  reframes?: CoachReframe[];
  doctrineHighlights?: DoctrineHighlight[];
  suggestions?: string[];
  nextStep?: string;
};

function createThreadId() {
  return `coach-${crypto.randomUUID()}`;
}

function deriveThreadTitle(messages: Message[]) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.text.trim();
  if (!firstUserMessage) {
    return "Untitled coaching thread";
  }

  return firstUserMessage.slice(0, 72);
}

function formatIssueLabel(issueType: CoachDiagnosis["issueType"]) {
  const labels: Record<CoachDiagnosis["issueType"], string> = {
    bigIdea: "Big Idea",
    situation: "Situation framing",
    rootCause: "Root cause",
    wiifm: "Audience value",
    ask: "Ask and close",
    flow: "Story flow",
    audience: "Audience alignment",
    general: "Story focus"
  };

  return labels[issueType];
}

export default function CoachPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, getRequestHeaders } = useAuth();
  const [threadId, setThreadId] = useState(() => searchParams.get("threadId") ?? createThreadId());
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Welcome to Story Coach. Ask a question or paste draft content for guidance on big ideas, framing, WIIFM, or overall story logic."
    }
  ]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    const requestedThreadId = searchParams.get("threadId");
    if (!requestedThreadId) {
      return;
    }

    void getRequestHeaders()
      .then((headers) =>
        postJson<{
      thread: {
        id: string;
        messages: Array<{
          role: "assistant" | "user";
          text: string;
          diagnosisJson?: CoachDiagnosis;
          reframesJson?: CoachReframe[];
          doctrineHighlightsJson?: DoctrineHighlight[];
          suggestionsJson?: string[];
          nextStep?: string | null;
        }>;
      };
    }>("/api/coach-thread", {
      action: "get",
      threadId: requestedThreadId
        }, { headers })
      )
      .then((response) => {
        setThreadId(response.thread.id);
        setMessages(
          response.thread.messages.map((message) => ({
            role: message.role,
            text: message.text,
            diagnosis: message.diagnosisJson,
            reframes: message.reframesJson,
            doctrineHighlights: message.doctrineHighlightsJson,
            suggestions: message.suggestionsJson,
            nextStep: message.nextStep ?? undefined
          }))
        );
        setError("");
      })
      .catch(() => {
        return;
      });
  }, [searchParams, user]);

  useEffect(() => {
    if (!user || messages.length <= 1) {
      return;
    }

    const title = deriveThreadTitle(messages);
    const timeoutId = window.setTimeout(() => {
      void getRequestHeaders()
        .then((headers) =>
          postJson("/api/coach-thread", {
            action: "upsert",
            thread: {
              id: threadId,
              title,
              messages: messages.map((message) => ({
                role: message.role,
                text: message.text,
                diagnosis: message.diagnosis,
                reframes: message.reframes,
                doctrineHighlights: message.doctrineHighlights,
                suggestions: message.suggestions,
                nextStep: message.nextStep
              }))
            }
          }, { headers })
        )
        .catch(() => {
          return;
        });
    }, 500);

    if (searchParams.get("threadId") !== threadId) {
      navigate(`/coach?threadId=${threadId}`, { replace: true });
    }

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [messages, navigate, searchParams, threadId, user, getRequestHeaders]);

  const quickPrompts = useMemo(
    () => [
      "Help me write a stronger Big Idea.",
      "How should I frame the situation for skeptical executives?",
      "Rewrite this recommendation so the yes feels safer.",
      "What is the WIIFM for this audience?",
      "Tighten my opening gambit."
    ],
    []
  );

  async function handleSubmit() {
    const trimmed = message.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const nextUserMessage: Message = { role: "user", text: trimmed };
    setMessages((current) => [...current, nextUserMessage]);
    setMessage("");
    setError("");
    setIsLoading(true);

    try {
      const payloadMessages = [...messages, nextUserMessage].map((item) => ({
        role: item.role,
        content: item.text
      }));
      const headers = await getRequestHeaders();
      const data = await postJson<CoachResponse>("/api/coach", {
        messages: payloadMessages
      }, { headers });
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: data.reply,
          diagnosis: data.diagnosis,
          reframes: data.reframes,
          doctrineHighlights: data.doctrineHighlights,
          suggestions: data.suggestedQuestions,
          nextStep: data.suggestedNextStep
        }
      ]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed");
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: "I hit an error generating coaching. Please try again. If it persists, verify the server and OpenAI configuration."
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="page page-coach">
      <section className="app-hero">
        <p className="section-kicker">Story Coach</p>
        <h1 className="page-title">Refine big ideas, sharpen framing, and strengthen story logic.</h1>
        <p className="page-subtitle">
          Ask a question, paste draft content, or use a quick prompt to keep improving the story before it goes in front of an audience.
        </p>
      </section>

      <div className="coach-quick-prompts">
        {quickPrompts.map((prompt) => (
          <button key={prompt} className="secondary-button quick-prompt-button" onClick={() => setMessage(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      {error ? <p className="helper-error">{error}</p> : null}

      <div className="chat-panel">
        <div className="chat-messages">
          {messages.map((entry, index) => (
            <div key={`${entry.role}-${index}`} className={`chat-message chat-${entry.role}`}>
              <div>{entry.text}</div>
              {entry.diagnosis ? (
                <div className="coach-block">
                  <div className="coach-block-title">What I&apos;m seeing</div>
                  <div><strong>{formatIssueLabel(entry.diagnosis.issueType)}</strong>: {entry.diagnosis.summary}</div>
                  <div className="coach-sublist">
                    <strong>What may be driving it</strong>
                    <ul>
                      {entry.diagnosis.likelyCauses.map((cause) => (
                        <li key={cause}>{cause}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="coach-sublist">
                    <strong>How I&apos;d strengthen it</strong>
                    <ul>
                      {entry.diagnosis.suggestedFixes.map((fix) => (
                        <li key={fix}>{fix}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
              {entry.reframes?.length ? (
                <div className="coach-block">
                  <div className="coach-block-title">Options to consider</div>
                  <div className="coach-reframes">
                    {entry.reframes.map((reframe) => (
                      <div key={reframe.label} className="coach-reframe-card">
                        <strong>{reframe.label}</strong>
                        <div>{reframe.text}</div>
                        <div className="coach-reframe-note"><strong>Why it works:</strong> {reframe.whyItWorks}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {entry.doctrineHighlights?.length ? (
                <div className="coach-block">
                  <div className="coach-block-title">Why this works</div>
                  <div className="coach-reframes">
                    {entry.doctrineHighlights.map((item) => (
                      <div key={item.title} className="coach-principle-card">
                        <strong>{item.title}</strong>
                        <div>{item.guidance}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {entry.nextStep ? (
                <div className="coach-block">
                  <div className="coach-block-title">What I&apos;d do next</div>
                  <div>{entry.nextStep}</div>
                </div>
              ) : null}
              {entry.suggestions?.length ? (
                <div className="suggestion-list">
                  {entry.suggestions.map((suggestion) => (
                    <button key={suggestion} className="suggestion-chip" onClick={() => setMessage(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {isLoading ? <div className="chat-message chat-assistant">Thinking…</div> : null}
        </div>

        <div className="chat-input-row">
          <textarea
            className="chat-input"
            placeholder="Type your question about your deck or story..."
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
          />
          <button className="primary-button" onClick={() => void handleSubmit()} disabled={isLoading || !message.trim()}>
            {isLoading ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </section>
  );
}
