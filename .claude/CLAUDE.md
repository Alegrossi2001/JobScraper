# AutoHire Poznań

A high-velocity, automated job acquisition pipeline tailored for the Poznań tech market. Designed to minimize manual intervention from discovery to post-application outreach.

## Architecture Philosophy
*   **Hyper-Personalized:** Zero-shot generation of ATS-optimized, custom CVs via LLM-driven keyword alignment with specific Job Descriptions (JDs).
*   **Production-Grade:** Adheres to senior-level coding standards; decoupled, type-safe, and resilient.
*   **Hands-Off:** Designed as a "set-and-forget" pipeline. Once triggered, the system handles the application workflow and follow-up sequences.

## Pipeline Lifecycle

1.  **Ingestion:** Scrapes and fetches listings from target Polish job boards.
2.  **Synthesis:** 
    *   Parses JDs to extract core requirements.
    *   Generates a custom, role-specific CV variant.
    *   Drafts personalized outreach messaging (LinkedIn/Email).
3.  **Action:** Executes application via browser automation and interacts with platform APIs.
4.  **Persistence:** Tracks application state (e.g., `Applied`, `Contacted`, `Pending`) in a local data store.

## Technical Stack
*   **Runtime:** Node.js / TypeScript (Strict Mode).
*   **Architecture:** Decoupled microservices communicating via events to ensure service independence.
*   **Automation:** Playwright (headless) for interaction with platforms lacking public APIs.

## Implementation Priorities
- [ ] **Phase 1: Discovery** – Stable ingestion of tech-sector job postings in Poznań.
- [ ] **Phase 2: Customization** – Implementation of the prompt-chaining engine for CV and cover letter synthesis.
- [ ] **Phase 3: Execution** – Automated browser interaction module for form filling and submission.
- [ ] **Phase 4: Outreach** – Automated follow-up scheduling for LinkedIn/Email correspondence.

---

### Technical Constraints
*   **Service Independence:** Shared packages must reflect changes immediately to ensure services remain decoupled without requiring full monorepo rebuilds.
*   **Type Safety:** Strict `TypeScript` interfaces for all data models (CV, JD, Application) to prevent runtime errors during LLM synthesis.
*   **Auth Persistence:** Utilization of browser context caching (cookies/storage) to maintain session state on major platforms.