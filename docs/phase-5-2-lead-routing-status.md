# Phase 5.2 Lead Routing Status

## Business rule

Prospectors are not tied to one store. A prospector captures a customer and chooses the destination store when saving the survey or quick registration.

## Completed

- Prospector screen shows the list of registered stores.
- Street survey requires a destination store.
- Quick registration requires a destination store.
- Lead is saved with assigned_store_id.
- Store pipeline filters leads by assigned_store_id.
- Store pipeline now explains that leads are received from prospector routing.
- Store pipeline shows selected store, received leads count, and new leads count.

## Files changed

- src/app/prospector/live/page.tsx
- src/app/store/live/page.tsx

## Current data flow

1. Master creates stores.
2. Prospector captures customer.
3. Prospector selects destination store.
4. Lead is saved with assigned_store_id.
5. Store sees the lead in its pipeline.

## Next recommended step

Improve the store operation page so sale/loss actions keep the selected store context after submit and show clearer validation messages.
