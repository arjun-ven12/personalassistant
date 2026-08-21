import {
  AlexaConversationClassificationSchema,
  AlexaSpeechActSchema,
  type AlexaConversationClassification,
  type AlexaSpeechAct,
} from "@alexa-control/shared";

const ACTION =
  /\b(?:open|launch|start|run|execute|delete|remove|close|quit|create|make|move|rename|send|submit|approve|deploy|install|uninstall|turn on|turn off)\b/i;
const NEGATIVE =
  /\b(?:do not|don't|dont|never|stop asking to|without)\b.{0,80}\b(?:open|launch|start|run|execute|delete|remove|close|quit|create|move|rename|send|submit|approve|deploy)\b/i;
const HYPOTHETICAL =
  /\b(?:if i|if we|would i|would you|could i|could you tell me how|how would|suppose|imagine|thinking about|might|maybe i(?:'ll| will))\b/i;
const PAST =
  /\b(?:did you|have you|what did|why did|when did|where did|was .* (?:opened|deleted|sent|created)|earlier|previously|last time)\b/i;
const QUESTION =
  /^(?:who|what|when|where|why|how|which|can you (?:explain|tell)|could you (?:explain|tell)|do you know|is|are|am|does|did|will|would|should|could)\b|\?\s*$/i;
const QUOTED = /(?:^|\s)["'](?:open|launch|run|delete|send|deploy)\b[^"']*["']/i;
const FOLLOW_UP =
  /^(?:and|also|then|so|okay,?|ok,?)\b|\b(?:that|it|this one|the previous one|what about)\b/i;
const MULTI = /\b(?:and then|then also|after that|;|, and (?:open|send|create|run))\b/i;
const CONVERSATIONAL_ACTION_WORD =
  /\b(?:make (?:that|this|the) (?:answer|explanation|summary) (?:simpler|shorter|clearer)|tell me|explain|summarize|compare)\b/i;

export type DeterministicConversationClassification = {
  classification: AlexaConversationClassification;
  speechAct: AlexaSpeechAct;
  explicitAction: boolean;
  mustNotExecute: boolean;
  ambiguousReference: boolean;
  explanation: string;
};

export const classifyConversationTurn = (
  transcript: string,
): DeterministicConversationClassification => {
  const text = transcript.trim();
  const explicitAction = ACTION.test(text) && !CONVERSATIONAL_ACTION_WORD.test(text);
  const negative = NEGATIVE.test(text);
  const hypothetical = HYPOTHETICAL.test(text);
  const quoted = QUOTED.test(text);
  const past = PAST.test(text);
  const multi = MULTI.test(text);
  const followUp = FOLLOW_UP.test(text);
  const ambiguousReference =
    /\b(?:that|it|this one|the one|same thing)\b/i.test(text) && text.length < 140;

  let speechAct: AlexaSpeechAct = "STATEMENT";
  if (negative) speechAct = "NEGATIVE_COMMAND";
  else if (hypothetical) speechAct = "HYPOTHETICAL";
  else if (quoted) speechAct = "QUOTED_COMMAND";
  else if (past) speechAct = "PAST_ACTION_REFERENCE";
  else if (multi) speechAct = "MULTI_INTENT";
  else if (QUESTION.test(text)) speechAct = "QUESTION";
  else if (explicitAction) speechAct = "ACTION_REQUEST";
  else if (followUp) speechAct = "FOLLOW_UP";

  const mustNotExecute = negative || hypothetical || quoted || past;
  let classification: AlexaConversationClassification = "ANSWER";
  if (negative) classification = "NON_EXECUTION";
  else if (hypothetical || quoted || past) classification = "ANSWER";
  else if (multi) classification = "MULTI_INTENT";
  else if (explicitAction && ambiguousReference) classification = "CLARIFY";
  else if (explicitAction) classification = "ACTION";

  return {
    classification: AlexaConversationClassificationSchema.parse(classification),
    speechAct: AlexaSpeechActSchema.parse(speechAct),
    explicitAction,
    mustNotExecute,
    ambiguousReference,
    explanation: mustNotExecute
      ? "Deterministic speech-act rules classify this as discussion, negation, quotation, hypothetical language, or a past-action reference."
      : explicitAction
        ? "The user used explicit imperative action language."
        : "No explicit executable instruction was present, so this is an answerable conversation turn.",
  };
};
