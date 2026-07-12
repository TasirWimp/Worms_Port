import os from 'os';
import { createRuntimeServer } from './runtime';

const port = Number(process.env.PORT) || 3000;
const sessionOpenRateCapacity = Number(process.env.SESSION_OPEN_RATE_CAPACITY);
const runtime = createRuntimeServer({
    sessionOpenRateCapacity: Number.isFinite(sessionOpenRateCapacity) &&
        sessionOpenRateCapacity > 0
        ? sessionOpenRateCapacity
        : undefined
});

runtime.listen(port, '0.0.0.0').then(() => {
    for (let ifaceinfo of Object.values(os.networkInterfaces())) {
        for (let iface of ifaceinfo || []) {
            if (!iface.internal && iface.family == 'IPv4') {
                console.log(`Listening on http://${iface.address}:${port}`);
            }
        }
    }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        runtime.close()
            .then(() => process.exit(0))
            .catch((error) => {
                console.error(error);
                process.exit(1);
            });
    });
}
