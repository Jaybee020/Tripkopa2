-- Customer-facing itinerary and booking data must pass through the backend's
-- field-level repayment policy. Service-role and operations access still bypass
-- RLS; authenticated customers can no longer select the raw provider payloads.
DROP POLICY IF EXISTS itineraries_owner_read ON public.itineraries;
DROP POLICY IF EXISTS bookings_owner_read ON public.bookings;
DROP POLICY IF EXISTS operational_events_authenticated_read ON public.operational_events;
