function bindSessionToSocket(sessionMiddleware) {
	return (socket, next) => {
		sessionMiddleware(socket.request, {}, next);
	};
}

module.exports = {
	bindSessionToSocket,
};
