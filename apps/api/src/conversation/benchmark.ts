import type {
  AlexaConversationClassification,
  ConversationRouteStage,
} from "@alexa-control/shared";

export type ConversationBenchmarkCase = {
  id: string;
  category: string;
  utterance: string;
  expectedClassification: AlexaConversationClassification;
  expectedExecution: boolean;
  expectedRouteClass: ConversationRouteStage[];
  requiredContextSources: string[];
  forbiddenContextSources: string[];
  shouldClarify: boolean;
  mustNotExecute: boolean;
};

type CaseGroup = Omit<ConversationBenchmarkCase, "id" | "utterance"> & {
  utterances: [string, string, string];
};

const groups: CaseGroup[] = [
  { category: "general-question", utterances: ["What is inflation?", "Why do companies issue bonds?", "How does quantum computing work?"], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["GPT"], requiredContextSources: [], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: false },
  { category: "ai-conversation", utterances: ["What is the biggest weakness in this idea?", "Give me an example of that tradeoff.", "Explain that another way."], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["GPT"], requiredContextSources: ["CONVERSATION"], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: false },
  { category: "page-explanation", utterances: ["Explain this page to me.", "Summarize the current page.", "What am I looking at on this page?"], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["PAGE", "GPT"], requiredContextSources: ["ACTIVE_PAGE"], forbiddenContextSources: ["SECRET"], shouldClarify: false, mustNotExecute: false },
  { category: "selection", utterances: ["What does this selected paragraph mean?", "Explain this selection.", "Can you simplify the highlighted text?"], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["PAGE", "GPT"], requiredContextSources: ["SELECTION"], forbiddenContextSources: ["PASSWORD"], shouldClarify: false, mustNotExecute: false },
  { category: "screen-reference", utterances: ["What's on my screen?", "What application am I looking at?", "Tell me what this view shows."], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["APPLICATION_CONTEXT", "GPT"], requiredContextSources: ["APPLICATION"], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: false },
  { category: "memory", utterances: ["What model did I decide to use locally?", "Do you remember my preference for local AI?", "What did we decide about Gemma?"], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["MEMORY", "GPT"], requiredContextSources: ["MEMORY"], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: false },
  { category: "project-memory", utterances: ["What was I working on earlier?", "What did I decide about this project?", "Remind me where I left off in the repository."], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["MEMORY", "GPT"], requiredContextSources: ["PROJECT", "RECENT_ACTIVITY"], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: false },
  { category: "commands", utterances: ["Open VS Code.", "Launch the registered notes app.", "Start the approved project workspace."], expectedClassification: "ACTION", expectedExecution: true, expectedRouteClass: ["ACTION"], requiredContextSources: [], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: false },
  { category: "indirect-commands", utterances: ["Can you open VS Code?", "I want you to launch the registered notes app.", "Please open the approved repository."], expectedClassification: "ACTION", expectedExecution: true, expectedRouteClass: ["ACTION"], requiredContextSources: [], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: false },
  { category: "negation", utterances: ["Don't open VS Code.", "Do not delete that file.", "I never want you to launch Terminal."], expectedClassification: "NON_EXECUTION", expectedExecution: false, expectedRouteClass: ["NON_EXECUTION"], requiredContextSources: [], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: true },
  { category: "quoted-command", utterances: ["He said 'open VS Code' in the demo.", "The guide says \"run the command\".", "I heard someone say 'delete the file'."], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["GPT"], requiredContextSources: [], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: true },
  { category: "hypothetical", utterances: ["If I opened VS Code, would that affect anything?", "How would I run that command safely?", "Suppose we deleted the draft, what would happen?"], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["GPT"], requiredContextSources: [], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: true },
  { category: "past-action", utterances: ["Why did you open VS Code?", "What did the last command change?", "Have you sent that report already?"], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["GPT"], requiredContextSources: ["EXECUTION_EVENT"], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: true },
  { category: "multi-intent", utterances: ["Explain this page and then open the GitHub repo.", "Summarize this error and then launch the project.", "Tell me what this means and then open VS Code."], expectedClassification: "MULTI_INTENT", expectedExecution: true, expectedRouteClass: ["GPT", "ACTION"], requiredContextSources: ["ACTIVE_PAGE"], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: false },
  { category: "ambiguous-action", utterances: ["Open it.", "Launch that.", "Delete this one."], expectedClassification: "CLARIFY", expectedExecution: false, expectedRouteClass: ["CLARIFICATION"], requiredContextSources: ["CONVERSATION"], forbiddenContextSources: [], shouldClarify: true, mustNotExecute: false },
  { category: "error-explanation", utterances: ["Why is this failing?", "What does this error mean?", "Can you explain the last provider failure?"], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["GPT"], requiredContextSources: ["RECENT_ACTIVITY"], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: false },
  { category: "temporal", utterances: ["What was I doing earlier?", "What did we discuss yesterday?", "Where did I leave off this morning?"], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["MEMORY", "GPT"], requiredContextSources: ["RECENT_ACTIVITY"], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: true },
  { category: "comparison", utterances: ["Compare this page to what we discussed yesterday.", "What's different between this and the previous design?", "How does this approach compare with the other one?"], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["PAGE", "MEMORY", "GPT"], requiredContextSources: ["ACTIVE_PAGE", "CONVERSATION"], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: false },
  { category: "follow-up", utterances: ["Tell me more.", "Why does that matter?", "Make that explanation simpler."], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["MEMORY", "GPT"], requiredContextSources: ["CONVERSATION"], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: false },
  { category: "statement", utterances: ["I was thinking about opening VS Code later.", "This design seems too complicated.", "The local model feels slow today."], expectedClassification: "ANSWER", expectedExecution: false, expectedRouteClass: ["GPT"], requiredContextSources: ["CONVERSATION"], forbiddenContextSources: [], shouldClarify: false, mustNotExecute: false },
];

const variants = [
  (value: string) => value,
  (value: string) => `Alexa, ${value.charAt(0).toLowerCase()}${value.slice(1)}`,
  (value: string) => `Uh, ${value.charAt(0).toLowerCase()}${value.slice(1)}`,
  (value: string) => `${value.replace(/[.?]$/, "")}, please.`,
  (value: string) => `Hey Alexa, ${value.charAt(0).toLowerCase()}${value.slice(1)}`,
];

export const phase21AConversationBenchmark: ConversationBenchmarkCase[] = groups.flatMap(
  (group, groupIndex) =>
    group.utterances.flatMap((utterance, utteranceIndex) =>
      variants.map((variant, variantIndex) => ({
        id: `21a-${String(groupIndex + 1).padStart(2, "0")}-${utteranceIndex + 1}-${variantIndex + 1}`,
        category: group.category,
        utterance: variant(utterance),
        expectedClassification: group.expectedClassification,
        expectedExecution: group.expectedExecution,
        expectedRouteClass: group.expectedRouteClass,
        requiredContextSources: group.requiredContextSources,
        forbiddenContextSources: group.forbiddenContextSources,
        shouldClarify: group.shouldClarify,
        mustNotExecute: group.mustNotExecute,
      })),
    ),
);
