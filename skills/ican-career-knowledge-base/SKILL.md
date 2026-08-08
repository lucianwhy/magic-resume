---
name: ican-career-knowledge-base
description: Build, enrich, query, and maintain a user's long-lived personal career knowledge base through natural conversation. Use when the user shares or asks about projects, internships, education, skills, achievements, content creation, career goals, target roles or cities, work values, learning plans, interview reflections, or asks what information to collect, emphasize, omit, or verify for future resumes and interviews.
---

# ICAN Career Knowledge Base

Maintain a source-of-truth for career facts and personal career context. Do not treat it as a resume writer. Preserve more information than any one resume uses, then make later selection explainable.

## Start

1. Resolve the knowledge-base root from user context or a supplied path.
2. If no root exists, ask where to create it. Do not silently choose a user-data location.
3. If a root exists, read its overview, open loops, and only records relevant to the current topic.
4. Read [record-schema.md](references/record-schema.md) before creating or changing records.
5. Read [questioning.md](references/questioning.md) when choosing a follow-up question.

## Choose a mode

| User intent | Mode | Action |
|---|---|---|
| Shares an experience, preference, goal, file, or reflection | Capture | Extract and store claims. |
| Asks what to add or what is missing | Audit | Find high-value gaps. |
| Asks whether an experience suits a role or interview | Retrieve | Explain relevant facts and missing proof. |
| Asks to revise or remove a record | Curate | Preserve source history and update the derived record. |

## Capture workflow

1. Accept natural language, files, links, screenshots, and existing resumes. Do not force a long form.
2. Extract atomic claims. Classify each as fact, preference, goal, reflection, or unverified claim.
3. Preserve supplied material under sources. Record its path or link in every derived claim.
4. Create or update the smallest relevant record. Do not merge unrelated experiences into one record.
5. Tag each record with possible role lenses such as engineering, product, delivery, collaboration, growth, or user insight. Tags describe possible retrieval lenses, not stronger claims.
6. Add an open loop only when missing information would materially improve a future resume, interview, or decision.
7. Ask at most one follow-up question per turn. Choose the highest-information-gain question, not the first empty field.
8. Report what was stored, what it can later support, and the one next question.

## Evidence and integrity

- Treat user statements and attached materials as sources; never invent responsibilities, technologies, metrics, awards, employers, or dates.
- Keep facts, preferences, goals, and opinions distinct.
- Mark missing detail as unknown or pending. Do not interpret an absent record as a negative fact.
- Preserve original source wording when a number, title, date, or claim may matter.
- Separate candidate narratives from confirmed facts. A narrative may reorganize facts but may not add claims.
- Mark contact details, photos, precise addresses, documents, and private reflections as sensitive. Default them to private and exclude them from future public outputs unless the user asks.

## Retrieval rules

When asked about a role, JD, resume, interview, or learning plan:

1. Retrieve facts with matching role lenses and evidence.
2. State what to emphasize, what to mention briefly, and what to omit for this use case.
3. Explain why using the user's stated goals and the role requirements.
4. Surface only gaps that block a credible answer. Missing keywords never prove missing ability.
5. Hand off to a resume-tailoring or interview-coaching workflow for final output. Do not silently edit a resume.

## Conversation style

- Start from the user's own story. Ask concrete questions about choices, ownership, results, and evidence.
- Prefer: “你负责的模拟直播模块，学生从进入到完成练习，会经历哪几个步骤？” over generic requests for more detail.
- Treat career goals, cities, work values, and learning plans as useful first-class context, not filler.
- Do not interrogate. Let the user skip any item and capture it later.

## Required response after every write

Return:

1. Stored records or updated claims.
2. Retrieval lenses newly enabled.
3. One highest-value follow-up question, unless no important gap remains.

