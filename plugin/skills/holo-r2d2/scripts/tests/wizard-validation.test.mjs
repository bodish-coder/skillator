import test from "node:test";
import assert from "node:assert/strict";
import { nextWizardSet, checkSet, SET_SCHEMA, ANSWER_SCHEMA } from "../wizard.mjs";

function makeFixtureSet(overrides = {}) {
  return checkSet({
    schema: SET_SCHEMA,
    id: "RUN-1",
    title: "RUN-1 - Test Run",
    source: "run.md",
    decisions: [
      {
        id: "Q1",
        ticket: "A10",
        question: "Choose storage backend?",
        options: [
          { id: "o1", label: "SQLite", does: "Embedded storage", tradeoff: "Single writer" },
          { id: "o2", label: "PostgreSQL", does: "Client-server storage", tradeoff: "Extra service" },
        ],
      },
      {
        id: "Q2",
        ticket: "A11",
        question: "Choose cache layer?",
        options: [
          { id: "o1", label: "In-memory LRU", does: "Fast local cache", tradeoff: "Process bound" },
          { id: "o2", label: "Redis", does: "Shared cache", tradeoff: "Network hop" },
        ],
      },
    ],
    settled: [],
    ...overrides,
  });
}

function makeValidAnswers(overrides = {}) {
  return {
    schema: ANSWER_SCHEMA,
    set: "RUN-1",
    owner: "Alex Owner",
    reviewed: true,
    final: true,
    finalizedAt: "2026-11-05T10:00:00.000Z",
    answers: [
      {
        id: "Q1",
        question: "Choose storage backend?",
        status: "answered",
        choice: { id: "o1", label: "SQLite" },
        notes: "approved for dev",
      },
      {
        id: "Q2",
        question: "Choose cache layer?",
        status: "deferred",
        choice: { id: "defer" },
        clarification: "Need benchmarks under high load",
      },
    ],
    ...overrides,
  };
}

test("rejection: wrong set answers cannot settle active questions", () => {
  const set = makeFixtureSet();
  const wrongSetAns = makeValidAnswers({ set: "RUN-999" });

  assert.throws(
    () => nextWizardSet(set, wrongSetAns),
    /set .* does not match active set/i,
    "should reject answers for a different set"
  );
});

test("rejection: draft or unapproved answers cannot settle active questions", () => {
  const set = makeFixtureSet();

  // Unfinalized draft (finalizedAt is null)
  assert.throws(
    () => nextWizardSet(set, makeValidAnswers({ finalizedAt: null })),
    /draft|not finalized/i,
    "should reject unfinalized answers"
  );

  // Unreviewed (reviewed is false)
  assert.throws(
    () => nextWizardSet(set, makeValidAnswers({ reviewed: false })),
    /draft|not finalized|reviewed/i,
    "should reject unreviewed answers"
  );

  // Missing owner
  assert.throws(
    () => nextWizardSet(set, makeValidAnswers({ owner: "" })),
    /draft|owner/i,
    "should reject answers without owner approval"
  );

  // final explicitly false
  assert.throws(
    () => nextWizardSet(set, makeValidAnswers({ final: false })),
    /draft|not finalized/i,
    "should reject answers with final=false"
  );
});

test("rejection: stale round answers cannot settle active questions", () => {
  const setR2 = makeFixtureSet({ round: 2 });
  const ansR1 = makeValidAnswers({ round: 1 });

  assert.throws(
    () => nextWizardSet(setR2, ansR1),
    /round .* does not match active round/i,
    "should reject answers from a stale round"
  );

  const setR1 = makeFixtureSet({ round: 1 });
  const ansR3 = makeValidAnswers({ round: 3 });
  assert.throws(
    () => nextWizardSet(setR1, ansR3),
    /round .* does not match active round/i,
    "should reject answers for a future round"
  );
});

test("rejection: invalid option payloads cannot settle active questions", () => {
  const set = makeFixtureSet();

  // Unknown option id
  const badOptAns = makeValidAnswers({
    answers: [
      { id: "Q1", choice: { id: "o999", label: "SQLite" } },
    ],
  });
  assert.throws(
    () => nextWizardSet(set, badOptAns),
    /unknown option/i,
    "should reject unknown option ID"
  );

  // Mismatched option label
  const forgedLabelAns = makeValidAnswers({
    answers: [
      { id: "Q1", choice: { id: "o1", label: "Forged Malicious Label" } },
    ],
  });
  assert.throws(
    () => nextWizardSet(set, forgedLabelAns),
    /label does not match active set/i,
    "should reject mismatched option label"
  );

  // Unknown decision ID
  const unknownQAns = makeValidAnswers({
    answers: [
      { id: "Q99", choice: { id: "o1", label: "Anything" } },
    ],
  });
  assert.throws(
    () => nextWizardSet(set, unknownQAns),
    /unknown decision id/i,
    "should reject unknown decision ID"
  );

  // Already settled decision ID
  const setWithSettled = makeFixtureSet({
    decisions: [
      {
        id: "Q2",
        ticket: "A11",
        question: "Choose cache layer?",
        options: [{ id: "o1", label: "In-memory LRU" }],
      },
    ],
    settled: [
      { id: "Q1", ticket: "A10", question: "Choose storage backend?", state: "answered", answer: "SQLite", source: "RUN-1 round 1" },
    ],
  });
  const alreadySettledAns = makeValidAnswers({
    answers: [
      { id: "Q1", choice: { id: "o1", label: "SQLite" } },
      { id: "Q2", choice: { id: "o1", label: "In-memory LRU" } },
    ],
  });
  assert.throws(
    () => nextWizardSet(setWithSettled, alreadySettledAns),
    /already settled/i,
    "should reject answers targeting already settled decisions"
  );

  // Duplicate decision ID in answers
  const dupAns = makeValidAnswers({
    answers: [
      { id: "Q1", choice: { id: "o1", label: "SQLite" } },
      { id: "Q1", choice: { id: "o2", label: "PostgreSQL" } },
    ],
  });
  assert.throws(
    () => nextWizardSet(set, dupAns),
    /answered twice|duplicate/i,
    "should reject duplicate decision answers"
  );

  // Mismatched question text
  const mismatchedQTextAns = makeValidAnswers({
    answers: [
      { id: "Q1", question: "Totally different question?", choice: { id: "o1", label: "SQLite" } },
    ],
  });
  assert.throws(
    () => nextWizardSet(set, mismatchedQTextAns),
    /question text does not match/i,
    "should reject mismatched question text"
  );
});

test("acceptance: valid approved answers advance round and move answered decision to settled", () => {
  const set = makeFixtureSet();
  const validAns = makeValidAnswers();

  const next = nextWizardSet(set, validAns);
  assert.equal(next.round, 2);
  assert.equal(next.decisions.length, 1);
  assert.equal(next.decisions[0].id, "Q2");
  assert.equal(next.settled.length, 1);
  assert.equal(next.settled[0].id, "Q1");
  assert.equal(next.settled[0].state, "answered");
  assert.ok(next.settled[0].answer.includes("SQLite"));
  assert.ok(next.settled[0].answer.includes("approved for dev"));
});
