function emitAvailabilityCounter(io, teacherId, counters) {
	if (!io || !teacherId || !counters) {
		return;
	}

	io.to(`user:${teacherId}`).emit('availability:summary', counters);
	io.to('broadcast:teachers').emit('availability:summary', counters);
}

function emitAvailabilityChange(io, teacherId, payload) {
	if (!io || !teacherId || !payload) {
		return;
	}

	io.to(`user:${teacherId}`).emit('availability:changed', payload);
	io.to('broadcast:teachers').emit('availability:changed', payload);
} 

module.exports = {
	emitAvailabilityChange,
	emitAvailabilityCounter,
};