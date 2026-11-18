// Numbers for the admin dashboard (the React dashboard your teammate builds can fetch this).
// GET /api/admin/dashboard  (admin only)  ->  totals, bookings by status / session / month, room status now, reviews.
const avg = list => list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length * 10) / 10 : 0;

export default function dashboardRoutes(app, ctx) {
  const { store, requireAuth } = ctx;

  app.get('/api/admin/dashboard', requireAuth('admin'), async (req, res) => {
    const s = await store.loadAll();
    const reservations = s.reservations || [];
    const count = status => reservations.filter(r => r.status === status).length;
    const money = r => r.paid ? (r.amount || 0) - (r.refund || 0) : 0;
    const now = new Date(ctx.clock());
    const today = now.toLocaleDateString('en-CA');
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const toMin = t => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);

    const byMonth = {};
    for (const r of reservations.filter(r => r.status !== 'Cancelled')) {
      const month = r.date.slice(0, 7);
      byMonth[month] = byMonth[month] || { month, bookings: 0, revenue: 0 };
      byMonth[month].bookings++;
      byMonth[month].revenue += money(r);
    }
    const bySession = {};
    for (const r of reservations.filter(r => r.status !== 'Cancelled')) bySession[r.session] = (bySession[r.session] || 0) + 1;

    const reviews = (s.reviews || []).map(v => {
      const stars = [...(v.handlerStars ? [v.handlerStars] : []), ...(v.cats || []).map(c => c.stars)];
      const comments = [v.handlerComment, ...(v.cats || []).map(c => c.comment)].filter(Boolean);
      return { id: v.id, name: v.name, session: v.session, rating: Math.round(avg(stars)), message: comments.join(' | ') };
    });

    res.json({
      totals: {
        bookings: reservations.length, confirmed: count('Assigned') + count('Requested'), concluded: count('Concluded'), cancelled: count('Cancelled'),
        revenue: Math.round(reservations.reduce((sum, r) => sum + money(r), 0) * 100) / 100,
        customers: new Set(reservations.map(r => r.email)).size, orders: (s.orders || []).length,
        supporters: (s.subscriptions || []).filter(x => x.status === 'active').length
      },
      byStatus: [{ name: 'Confirmed', value: count('Assigned') + count('Requested') }, { name: 'Concluded', value: count('Concluded') }, { name: 'Cancelled', value: count('Cancelled') }],
      bySession: Object.entries(bySession).map(([name, value]) => ({ name, value })),
      byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)),
      rooms: (s.rooms || []).map(room => {
        const busy = reservations.some(r => r.roomId === room.id && r.status !== 'Cancelled' && r.date === today && toMin(r.time) <= nowMin && nowMin < toMin(r.time) + (r.hours || 1) * 60);
        return { name: room.name, status: !room.active ? 'Maintenance' : busy ? 'Occupied' : 'Available' };
      }),
      reviews,
      ratings: {
        cats: (s.cats || []).map(c => { const v = (s.reviews || []).flatMap(x => x.cats || []).filter(x => x.id === c.id).map(x => x.stars); return { name: c.name, avg: avg(v), count: v.length }; }),
        handlers: Object.values((s.reviews || []).filter(v => v.handler && v.handlerStars > 0).reduce((groups, v) => {
          (groups[v.handler] = groups[v.handler] || { name: v.handlerName, stars: [] }).stars.push(v.handlerStars);
          return groups;
        }, {})).map(g => ({ name: g.name, avg: avg(g.stars), count: g.stars.length }))
      }
    });
  });
}
