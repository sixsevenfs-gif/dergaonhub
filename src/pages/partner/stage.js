// Where an order is in the evening run: new (not confirmed yet), ready (to shop),
// on_the_way, arriving, done (delivered).
export const stageOf = (o) => (o.status === 'completed' ? 'done' : o.status === 'placed' ? 'new' : o.dispatch || 'ready')
