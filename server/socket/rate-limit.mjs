export const DEFAULT_SOCKET_EVENT_RATE_LIMITS = {
	"terminal:create": { capacity: 4, refillPerSecond: 0.25 },
	"terminal:input": { capacity: 160, refillPerSecond: 100 },
	"terminal:resize": { capacity: 24, refillPerSecond: 12 },
	"terminal:close": { capacity: 16, refillPerSecond: 8 },
	"logs:subscribe": { capacity: 6, refillPerSecond: 0.5 },
	"logs:unsubscribe": { capacity: 12, refillPerSecond: 3 },
};

export function createSocketRateLimiter({ socketEventRateLimits, wsRejectionCounters }) {
	function consumeSocketRateLimit(socket, eventName, cost = 1) {
		const rule = socketEventRateLimits[eventName];
		if (!rule) {
			return true;
		}

		const now = Date.now();
		const key = `rate:${eventName}`;
		const state = socket.data[key] || {
			tokens: rule.capacity,
			updatedAt: now,
		};
		const elapsedSeconds = Math.max(0, (now - state.updatedAt) / 1000);
		const replenished = Math.min(rule.capacity, state.tokens + elapsedSeconds * rule.refillPerSecond);
		const nextState = {
			tokens: replenished,
			updatedAt: now,
		};

		if (nextState.tokens < cost) {
			socket.data[key] = nextState;
			wsRejectionCounters.rateLimited += 1;
			return false;
		}

		nextState.tokens -= cost;
		socket.data[key] = nextState;
		return true;
	}

	return {
		consumeSocketRateLimit,
	};
}
