# Analytics API Optimization Plan

## Database-Level Optimizations
- [ ] Add `unique_visitors` field to `DailyStats` table in schema.prisma
- [ ] Run Prisma migration for schema changes
- [ ] Update daily stats aggregation logic to compute unique visitors

## API-Level Optimizations
- [ ] Refactor api.analytics.ts to use raw SQL aggregations instead of multiple queries
- [ ] Implement proper DB-level pagination for top lists (limit 10 in query)
- [ ] Optimize unique visitors calculation using DailyStats
- [ ] Refactor api.bulk-analytics.ts to parallelize app processing
- [ ] Add Redis caching layer for frequently accessed data

## Code Structure Improvements
- [ ] Extract aggregation logic into reusable functions in analytics service
- [ ] Add query result caching within request lifecycle
- [ ] Implement lazy loading for non-critical data sections

## Monitoring & Metrics
- [ ] Add performance logging to identify slow queries
- [ ] Implement query execution time tracking

## Testing & Validation
- [ ] Test performance improvements with load testing
- [ ] Validate data accuracy after optimizations
- [ ] Monitor query execution times in production
