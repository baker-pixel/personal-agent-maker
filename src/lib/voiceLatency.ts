type Stage =
  | "utterance_end"
  | "stt_start"
  | "stt_complete"
  | "llm_start"
  | "llm_first_token"
  | "tts_start"
  | "audio_play_start";

interface Turn {
  turn_id: string;
  conversation_id: string | null;
  stages: Partial<Record<Stage, number>>;
}

let current: Turn | null = null;

export function startTurn() {
  current = {
    turn_id: `turn_${Date.now()}`,
    conversation_id: null,
    stages: {},
  };
}

export function setTurnConversationId(id: string) {
  if (current) current.conversation_id = id;
}

export function markStage(stage: Stage) {
  if (!current) return;
  if (current.stages[stage]) return; // only mark first occurrence
  current.stages[stage] = Date.now();
  if (stage === "audio_play_start") flush();
}

function flush() {
  if (!current) return;
  const s = current.stages;
  const ms: Record<string, number> = {};

  if (s.utterance_end && s.stt_start)       ms.utterance_to_stt   = s.stt_start        - s.utterance_end;
  if (s.stt_start    && s.stt_complete)      ms.stt_duration       = s.stt_complete      - s.stt_start;
  if (s.stt_complete && s.llm_start)         ms.stt_to_llm         = s.llm_start         - s.stt_complete;
  if (s.llm_start    && s.llm_first_token)   ms.llm_ttft           = s.llm_first_token   - s.llm_start;
  if (s.llm_first_token && s.tts_start)      ms.first_token_to_tts = s.tts_start         - s.llm_first_token;
  if (s.tts_start    && s.audio_play_start)  ms.tts_to_audio       = s.audio_play_start  - s.tts_start;
  if (s.utterance_end && s.audio_play_start) ms.total              = s.audio_play_start  - s.utterance_end;

  console.log(
    "%c[voice-latency]",
    "color:#7c3aed;font-weight:bold",
    JSON.stringify({ turn_id: current.turn_id, conversation_id: current.conversation_id, ms }, null, 2),
  );
  current = null;
}
