// =====================================================================
// THE DATA MODEL: every collection ("table"), its fields ("columns"),
// and how collections point at each other ("relations").
//
// MongoDB has no foreign keys. A relation is simply a field that holds the
// other document's id, for example reservation.roomId holds a room's id.
// Each relation is marked  -> collection.field  in the comments below.
// (docs/DATA-MODEL.md shows the same thing as tables and a diagram.)
// =====================================================================
import mongoose from 'mongoose';

const HH_MM = /^\d{2}:\d{2}$/;
const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
const time = { type: String, match: HH_MM };
const day = { type: String, match: YYYY_MM_DD };
const str = (max = 200) => ({ type: String, maxlength: max, trim: false });
const req = def => ({ ...def, required: true });
const sub = fields => new mongoose.Schema(fields, { _id: false, strict: 'throw' });

// Builds every model. "strict" decides what happens to a field the schema does not know:
// true = it is dropped quietly (production), 'throw' = it is an error (the tests use this to catch a missing field).
export function buildModels(strict = true, instance = mongoose) {
  const make = (name, fields, idField, extra = {}) => {
    const schema = new instance.Schema(fields, { strict, versionKey: false, ...extra });
    if (idField) schema.index({ [idField]: 1 }, { unique: true });
    return instance.model(name, schema);
  };

  const collections = {

    // ---- the rooms guests can book -------------------------------------------------
    rooms: make('Room', {
      id: req(str(30)),                                   // e.g. 'P1'   (other collections point here)
      code: req(str(10)),                                 // short label, e.g. 'P1'
      name: req(str(80)),
      type: { type: String, enum: ['Private', 'Open'], required: true },   // Private = one booking at a time, Open = shared
      capacity: { type: Number, required: true, min: 1, max: 500 },
      from: { type: String, default: '', validate: v => v === '' || HH_MM.test(v) },   // optional own opening hours
      to: { type: String, default: '', validate: v => v === '' || HH_MM.test(v) },
      active: { type: Boolean, default: true }
    }, 'id'),

    // ---- kinds of session (Private Cat Session, Cat Yoga Session, ...) ---------------
    sessions: make('Session', {
      id: req(str(30)),                                   // e.g. 'ps'
      name: req(str(80)),
      rooms: [str(30)],                                   // -> rooms.id  (which rooms can host it)
      max: { type: Number, required: true, min: 1, max: 500 },
      active: { type: Boolean, default: true },
      catChoice: { type: Boolean, default: false },       // do guests choose their cats?
      maxCats: { type: Number, default: 0, min: 0, max: 20 },
      minHours: { type: Number, default: 1, min: 1, max: 12 },
      maxHours: { type: Number, default: 3, min: 1, max: 12 }
    }, 'id'),

    // ---- prices PER HOUR (the same for any number of guests) --------------------------
    rates: make('Rate', {
      id: req(str(30)),
      name: req(str(120)),
      sessionId: { type: String, default: '' },           // -> sessions.id   ('' = every session)
      dayType: { type: String, enum: ['all', 'weekday', 'weekend', 'holiday'], required: true },
      pricePerHour: { type: Number, required: true, min: 0.01, max: 100000 },
      active: { type: Boolean, default: true }
    }, 'id'),

    // ---- public holidays and special days ---------------------------------------------
    holidays: make('Holiday', {
      id: req(str(30)),
      date: req(day),                                     // YYYY-MM-DD
      name: req(str(120)),
      mode: { type: String, enum: ['open', 'closed'], required: true },
      from: time, to: time
    }, 'id'),

    // ---- the cats ----------------------------------------------------------------------
    cats: make('Cat', {
      id: req(str(30)),
      name: req(str(60)),
      relation: str(120),
      notes: [str(300)],
      photo: { type: String, default: '', maxlength: 300000 },      // a picture path, or a small picture saved as text
      active: { type: Boolean, default: true },           // false = resting or unwell
      note: str(200),                                     // why it is resting
      handler: req(str(40))                               // -> users.username  (the staff member who looks after this cat)
    }, 'id'),

    // ---- events ------------------------------------------------------------------------
    events: make('Event', {
      id: req(str(30)), title: req(str(120)), start: req(day), end: req(day),
      text: str(1000), guest: str(300), offer: str(300)
    }, 'id'),

    // ---- the food and drink menu -------------------------------------------------------
    menuItems: make('MenuItem', {
      id: req(str(30)), name: req(str(120)),
      category: { type: String, enum: ['Drinks', 'Snacks'], required: true },
      price: { type: Number, required: true, min: 0.01, max: 10000 },
      available: { type: Boolean, default: true },
      photo: { type: String, default: '', maxlength: 300000 },
      description: str(200),
      allergens: { type: [{ type: String, enum: ['Dairy', 'Eggs', 'Gluten', 'Peanuts', 'Tree nuts', 'Soy', 'Fish', 'Shellfish', 'Sesame'] }], default: undefined }   // missing = "not added yet"
    }, 'id'),

    // ---- FAQ ---------------------------------------------------------------------------
    faq: make('Faq', { id: req(str(40)), q: req(str(300)), a: req(str(2000)) }, 'id'),

    // ---- messages from guests ----------------------------------------------------------
    feedbackMessages: make('Feedback', {
      id: req(str(40)),
      type: { type: String, enum: ['Feedback', 'Question', 'Complaint', 'Compliment'], required: true },
      name: req(str(80)), email: req(str(200)), message: req(str(1000)),
      sent: req(str(40)),
      status: { type: String, enum: ['New', 'Done', 'Published'], default: 'New' }
    }, 'id'),

    // ---- "Support us" subscriptions ----------------------------------------------------
    subscriptions: make('Subscription', {
      id: req(str(60)),
      email: req(str(200)),                               // -> users.email
      name: str(80), tier: { type: String, enum: ['friend', 'parent', 'guardian'], required: true },
      price: { type: Number, required: true }, startedAt: req(str(40)),
      status: { type: String, enum: ['active', 'cancelled'], default: 'active' }, cancelledAt: str(40)
    }, 'id'),

    // ---- staff leave ------------------------------------------------------------------
    handlerLeaves: make('Leave', {
      id: req(str(60)),
      handler: req(str(40)),                              // -> users.username
      start: req(day), end: req(day),
      reason: { type: String, enum: ['Sick', 'Urgent leave', 'Annual leave', 'Other'], required: true },
      note: str(300), createdAt: str(40)
    }, 'id'),

    // ---- THE BOOKINGS ------------------------------------------------------------------
    reservations: make('Reservation', {
      code: req(str(20)),                                 // e.g. 'CC-K7Q2M'  (the guest's booking code)
      name: str(80), email: str(200), phone: str(20),     // the guest, copied from their account  (email -> users.email)
      sessionId: str(30), session: str(80),               // -> sessions.id  (and its name when booked)
      roomId: str(30), roomCode: str(10), roomName: str(80), zone: str(100),   // -> rooms.id
      date: day, time, hours: { type: Number, min: 1, max: 12 }, endTime: time,
      guests: { type: Number, required: true, min: 1, max: 500 },
      requests: str(300),
      cats: [str(30)],                                    // -> cats.id  (the cats the guest chose)
      catNames: [str(60)],                                // names when booked (survive a rename)
      handler: str(80), handlerUsername: str(40),         // -> users.username  (chosen by the cats' handlers)
      handlerBy: { type: String, enum: ['cat', 'random', 'fallback', 'leave', 'admin', ''] },
      rateName: str(120), pricePerHour: Number, amount: Number,       // the price when booked (-> rates)
      paid: { type: Boolean, default: false },
      payment: sub({ method: { type: String, enum: ['PayNow', 'Card'] }, ref: String, amount: Number, paidAt: String }),
      status: { type: String, enum: ['Requested', 'Assigned', 'Concluded', 'Cancelled'], required: true },   // "Assigned" is shown as "Confirmed"
      createdAt: str(40),
      checkedIn: Number,                                  // guests who arrived (set by the handler)
      needsHandler: Boolean, needsAttention: str(400), changeNote: str(300),   // flags for the admin / notes for the guest
      refund: Number, refundPercent: Number, cancelledBy: { type: String, enum: ['guest', 'admin', 'system'] }, cancelledAt: str(40),
      cancelReason: str(120), cancelFee: Number, feePaid: Boolean,       // late-cancellation fee (and whether the guest has paid it)
      feePayment: sub({ method: { type: String, enum: ['PayNow', 'Card'] }, ref: String, amount: Number, paidAt: String }),
      payBy: str(40), autoConcluded: Boolean,                           // pay-before time, and set when the cafe concluded it by itself
      pricePerGuest: Number, assignedBy: str(20), reopenedReason: str(200)      // only on bookings made by older versions
    }, 'code'),

    // ---- reviews of cats and staff after a session -----------------------------------------
    reviews: make('Review', {
      id: req(str(60)),
      code: req(str(20)),                                 // -> reservations.code  (one review per booking)
      email: str(200), name: str(80), session: str(80), date: day,
      handler: str(40), handlerName: str(80),             // -> users.username
      handlerStars: { type: Number, min: 0, max: 5 }, handlerComment: str(300),
      cats: [sub({ id: String, name: String, stars: { type: Number, min: 1, max: 5 }, comment: { type: String, maxlength: 300 } })],   // id -> cats.id
      createdAt: str(40)
    }, 'id'),

    // ---- food and drink orders ----------------------------------------------------------------
    orders: make('Order', {
      code: req(str(20)),                                 // e.g. 'OR-1001'
      reservation: req(str(20)),                          // -> reservations.code
      zone: str(100), handler: str(80), email: str(200),
      items: [sub({ name: String, qty: Number, price: Number })],     // copied from the menu when ordered
      total: Number,
      status: { type: String, enum: ['Ordered', 'Served'], default: 'Ordered' },
      placed: str(40)
    }, 'code')
  };

  // ---- single settings documents ("config"): opening hours and the break length ----------------
  const Config = instance.model('Config', new instance.Schema({
    key: { type: String, required: true, unique: true },   // 'openHours' or 'settings'
    value: { type: instance.Schema.Types.Mixed, required: true }
  }, { versionKey: false }));

  // ---- people who can log in --------------------------------------------------------------------
  const User = instance.model('User', new instance.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },       // guests log in with this
    phone: String,
    username: { type: String, lowercase: true, trim: true, unique: true, sparse: true },    // staff log in with this
    contact: String,                                                                          // staff email shown to guests
    passwordHash: { type: String, required: true },                                           // NEVER the password itself
    role: { type: String, enum: ['guest', 'handler', 'admin'], default: 'guest' },
    avatar: { icon: { type: String, default: '' }, color: { type: String, default: '' } },   // the round picture in the header
    savedPayment: { method: { type: String, enum: ['PayNow', 'Card', ''], default: '' }, last4: { type: String, default: '' } },   // practice only: never a full card number
    resetCodeHash: { type: String, default: '' }, resetExpires: { type: Number, default: 0 }, resetTries: { type: Number, default: 0 }
  }, { versionKey: false, timestamps: true }));

  return { collections, Config, User };
}
