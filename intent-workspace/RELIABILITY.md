# Reliability of I2I By AI

The project supports client work, task and goal records, calendar controls, and a catalog of dashboard widgets. A passing test suite applies to its tested scenarios. It is not a guarantee of correct interpretation for every future message.

## What determines the answer

- The AI can interpret a request and select existing records or interface components. It cannot provide the displayed task status, priority, owner, deadline, blocker, goal progress, or investigation findings as free-form claims.
- The server validates task keys and goal IDs against the selected client's snapshot, then renders those facts from the records. Missing information is reported as **Not recorded**. Suggestions are identified as suggestions and never reported as completed work.
- Status, date and blocker answers remain only as accurate as the stored records. Partial snapshots and truncated descriptions are identified. Ambiguous references ask for a task or goal title.
- Unavailable records produce an error; they do not justify guessing. Unsupported requests are redirected to supported workspace work.

## Client context and current data

The selected client is included in investigation and layout planning. Single-client tools cannot target another client. Explicit comparisons can use valid client IDs. AI planner results are not cached, so each request uses a fresh investigation. Dashboard responses from superseded requests cannot replace a newer request's screen.

Client overview, issues, messages, meeting notes and usage belong to the selected client. The existing overdue project view, blockers and owner workload cover the whole workspace and are described that way. Client chats ask users to switch the Client selector before working with another client.

## Interface and action boundaries

Chat display commands such as **Show open issues**, **Show usage**, **Also show overdue tasks**, and **Open calendar** use the same approved dashboard layouts/refinements. Ambiguous or ordinary record questions stay in chat. Guided task creation still collects required details and requires explicit confirmation.

The AI chooses only validated catalog components. Findings and explanations use successful recorded data checks. Interpretation confidence is an estimate, not measured factual accuracy. Static and calculated widget evidence identifies missing data and treats stored cause hypotheses as hypotheses.

Action buttons prepare editable drafts from record excerpts. Opening an email app does not send an email. Calendar/Meet synchronization still requires its explicit controls; these changes do not grant chat those write tools. Resend reminders still require configured and enabled delivery.

## Checks

Run from `intent-workspace/server`:

```powershell
node --test --test-concurrency=1 intentRoutes.test.js chatRoutes.test.js conversationRoutes.test.js taskIntake.test.js plannerReliability.test.js verifiedAnswers.test.js tasks.test.js taskVisibility.test.js data/indianDemo.test.js
```

Run from `intent-workspace/client`:

```powershell
node --test src/clientQuickActions.test.js src/workspaceRequest.test.js src/taskAnswers.test.js src/taskDialog.test.js src/taskCreation.test.js
npm run build
```

The tests use synthetic records and mocked model responses. They check client isolation, changed records, malformed/forged AI output, ambiguity, missing facts, ranking, India dates, history, task confirmation and dashboard commands. The bundled 30 rule examples are one finite benchmark. Model interpretation on real unseen requests is not proven by those examples. Broader acceptance tests should be expanded with actual client requests and reviewed expected outcomes.
