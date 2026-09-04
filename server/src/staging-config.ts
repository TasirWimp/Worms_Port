/** Server-only, fail-closed admission for isolated owner Practice testing. */
export function stagingPracticeFromEnvironment(
    environment: NodeJS.ProcessEnv = process.env
): boolean {
    for (const name of Object.keys(environment)) {
        if (name.startsWith('NIMBLE_') &&
            name !== 'NIMBLE_RUNTIME_PROFILE' && name !== 'NIMBLE_DEPLOYMENT') {
            throw new Error('Unknown NIMBLE runtime setting.');
        }
    }
    const profile = environment.NIMBLE_RUNTIME_PROFILE;
    const deployment = environment.NIMBLE_DEPLOYMENT;
    if (profile === undefined || profile === 'production-v7') {
        if (deployment !== undefined && deployment !== 'production') {
            throw new Error('Normal V7 runtime requires an absent or production deployment setting.');
        }
        return false;
    }
    if (profile !== 'staging-v8d-practice') throw new Error('Unknown NIMBLE runtime profile.');
    if (deployment !== 'staging' || environment.NODE_ENV !== 'production') {
        throw new Error('V8D Practice staging requires staging deployment and NODE_ENV=production.');
    }
    if (environment.REWARD_MODE !== 'disabled') {
        throw new Error('V8D Practice staging requires explicit REWARD_MODE=disabled.');
    }
    const unsafe = Object.keys(environment).some(name => {
        if (!environment[name]?.trim() || name === 'REWARD_MODE') return false;
        return /^(REWARD_|IDENTITY_|NIMIQ_|PRACTICE_TEST_|WP014_)/.test(name) ||
            ['DATABASE_URL', 'ALLOW_MISSING_ORIGIN', 'SESSION_OPEN_RATE_CAPACITY'].includes(name);
    });
    if (unsafe) {
        throw new Error('V8D Practice staging refuses wallet, reward, database and test-only settings.');
    }
    // RENDER_EXTERNAL_URL is automatic hosting metadata, not wallet opt-in here.
    return true;
}
