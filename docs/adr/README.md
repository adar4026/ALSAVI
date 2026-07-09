# Architecture Decision Records (ADR)

Здесь фиксируются значимые архитектурные решения ALSAVI — по одному файлу на
решение. Каждый ADR имеет разделы: **Context**, **Options**, **Decision**,
**Consequences**. ADR иммутабелен по смыслу: если решение меняется, добавляется
новый ADR со статусом, замещающим предыдущий, а не переписывается старый.

Термины и принципы наследуются из
[`PROJECT_CONSTITUTION.md`](../../PROJECT_CONSTITUTION.md); карта архитектуры —
[`ARCHITECTURE.md`](../../ARCHITECTURE.md); ядро — [`ENGINE.md`](../../ENGINE.md).

| ADR | Заголовок | Статус |
|---|---|---|
| [ADR-001](ADR-001-scheduler-abstraction.md) | Scheduler abstraction | Accepted |
| [ADR-002](ADR-002-review-log-source-of-truth.md) | Review Log as Source of Truth | Accepted |
| [ADR-003](ADR-003-studysession-separation.md) | StudySession separation from LearningEngine | Accepted |
| [ADR-004](ADR-004-retrieval-responsibility.md) | Retrieval Responsibility | Accepted |
| [ADR-005](ADR-005-application-services-layer.md) | Application Services Layer | Proposed |
