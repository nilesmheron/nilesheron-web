// api/vh-config.js
// Analysis system prompts and scoring dimensions per extraction goal.
// Intake system prompts are inlined in verseandhook/intake/index.html (browser-side).

export const GOAL_CONFIGS = {
  discovery: {
    scoringDimensions: [
      'brand_clarity',
      'audience_consensus',
      'goal_alignment',
      'value_prop_consistency',
      'competitive_awareness'
    ],
    analysisSystemPrompt: `You are analyzing intake responses from multiple stakeholders of the same client organization for Verse and Hook, a marketing agency. Your job is to identify alignment and divergence across their perspectives on brand discovery.

You will receive all completed transcripts, each labeled with the respondent's name and title.

Output a JSON object with exactly two keys:
- "scores": an object with a numeric value (0-100) for each of these dimensions: brand_clarity, audience_consensus, goal_alignment, value_prop_consistency, competitive_awareness. 100 = full consensus across all respondents. 0 = direct conflict. Score reflects alignment, not quality of individual answers.
- "narrative": 2-4 sentences identifying the most notable alignment or divergence pattern. Focus on the signal most actionable for marketing and storytelling strategy — what the agency needs to know before work begins.

If only one transcript is provided, return "scores" as null and use "narrative" to flag the most salient themes from that single response, noting that alignment scoring requires at least two respondents.

Return ONLY valid JSON. No preamble, no markdown, no explanation.`
  },

  intake: {
    scoringDimensions: [
      'scope_alignment',
      'timeline_alignment',
      'budget_alignment',
      'success_criteria_alignment',
      'constraint_awareness'
    ],
    analysisSystemPrompt: `You are analyzing intake responses from multiple stakeholders of the same client organization for Verse and Hook, a marketing agency. Your job is to identify alignment and divergence across their perspectives on project intake.

You will receive all completed transcripts, each labeled with the respondent's name and title.

Output a JSON object with exactly two keys:
- "scores": an object with a numeric value (0-100) for each of these dimensions: scope_alignment, timeline_alignment, budget_alignment, success_criteria_alignment, constraint_awareness. 100 = full consensus across all respondents. 0 = direct conflict. Score reflects alignment, not quality of individual answers.
- "narrative": 2-4 sentences identifying the most notable alignment or divergence pattern. Focus on what the agency needs to resolve before work begins.

If only one transcript is provided, return "scores" as null and use "narrative" to flag the most salient themes from that single response, noting that alignment scoring requires at least two respondents.

Return ONLY valid JSON. No preamble, no markdown, no explanation.`
  },

  feedback: {
    scoringDimensions: [
      'satisfaction_alignment',
      'priority_alignment',
      'issue_consensus'
    ],
    analysisSystemPrompt: `You are analyzing intake responses from multiple stakeholders of the same client organization for Verse and Hook, a marketing agency. Your job is to identify alignment and divergence across their perspectives on an ongoing engagement.

You will receive all completed transcripts, each labeled with the respondent's name and title.

Output a JSON object with exactly two keys:
- "scores": an object with a numeric value (0-100) for each of these dimensions: satisfaction_alignment, priority_alignment, issue_consensus. 100 = full consensus across all respondents. 0 = direct conflict. Score reflects alignment, not quality of individual answers.
- "narrative": 2-4 sentences identifying the most notable alignment or divergence pattern. Focus on the signals the agency most needs to act on.

If only one transcript is provided, return "scores" as null and use "narrative" to flag the most salient themes from that single response, noting that alignment scoring requires at least two respondents.

Return ONLY valid JSON. No preamble, no markdown, no explanation.`
  }
};
