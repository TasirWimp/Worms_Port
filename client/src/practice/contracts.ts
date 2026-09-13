export type PracticeSessionCursor = {
    sessionId: string;
    nextSequence: number;
};

export type PracticeConnectionState = 'connected' | 'reconnecting';
export type Unsubscribe = () => void;
