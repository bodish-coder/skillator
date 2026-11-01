# Fixture recon: SmallSlot
Approved scope: web booking app, guest books one available slot, host views own bookings.
S01 public slots; S02 guest details; S03 confirmation; S04 host dashboard.
FL01 guest books: S01 -> S02 -> S03; FL02 host views own bookings: S04.
Entities: User, EventType, Booking. Evidence in this fixture only; these are synthetic requirements, no real target product.
Risks: timezone/DST, slot race/double submit, second-user isolation, duplicate payment webhook.
Pricing and marketing external research not yet performed. No account/provider/key or publication authorization.
