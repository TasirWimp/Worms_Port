import path from 'path';

import { peiConfigFromEnvironment } from './pei/config';
import { DurablePeiEarnTransferV0, NimiqRpcPeiEarnTransferAdapterV0 } from './pei/earn-transfer';
import { NimiqRpcPeiChainAdapterV0 } from './pei/nimiq-rpc-adapter';
import {
    assertPeiProxyQualityTestEnvironment,
    peiProxyTransferConfigFromEnvironment
} from './pei/proxy-config';
import { createPeiProxyRuntimeV0 } from './pei/proxy-runtime';
import { PostgresPeiProxyTransferStoreV0 } from './pei/transfer-store';

const port = Number(process.env.PORT) || 3001;
let runtime: ReturnType<typeof createPeiProxyRuntimeV0> | undefined;

void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});

async function main(): Promise<void> {
    assertPeiProxyQualityTestEnvironment();
    const config = peiConfigFromEnvironment();
    if (!config) throw new Error('The PEI proxy requires PEI_ENABLED=true.');
    const transferConfig = peiProxyTransferConfigFromEnvironment(config);
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) throw new Error('The PEI proxy requires DATABASE_URL.');
    const adapter = await NimiqRpcPeiEarnTransferAdapterV0.create(transferConfig);
    const earnTransfer = new DurablePeiEarnTransferV0(
        new PostgresPeiProxyTransferStoreV0(connectionString),
        adapter,
        transferConfig.paused
    );
    runtime = createPeiProxyRuntimeV0({
        clientDir: path.resolve('client/build'),
        config,
        earnTransfer,
        chainAdapter: new NimiqRpcPeiChainAdapterV0(transferConfig.rpcUrl)
    });
    await runtime.listen(port, '0.0.0.0');
    console.log(`PEI proxy listening on port ${port}; transfers ${
        transferConfig.paused ? 'paused' : 'enabled'
    }; network ${transferConfig.network}`);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        runtime?.close()
            .then(() => process.exit(0))
            .catch((error) => {
                console.error(error);
                process.exit(1);
            });
    });
}
