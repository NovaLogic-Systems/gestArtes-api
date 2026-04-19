const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

async function resetUserPassword(req, res, next) {
    try {
        const targetUserId = Number(req.params.id);
        const newPassword = String(req.body?.newPassword || '');

        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        // Encontra o user alvo atraves do ID e verifica se ele existe, esta ativo e nao foi apagado
        const targetUser = await prisma.user.findUnique({
            where: { UserID: targetUserId },
            select: { UserID: true, IsActive: true, DeletedAt: true },
        });

        // protecao contra reset de password de users inativos ou apagados
        if (!targetUser || !targetUser.IsActive || targetUser.DeletedAt) {
            return res.status(404).json({ error: 'User not found' });
        }

        const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

        await prisma.user.update({
            where: { UserID: targetUserId },
            data: {
                PasswordHash: passwordHash,
                UpdatedAt: new Date(),
            },
        });

        return res.status(204).send();
    } catch (error) {
        return next(error);
    }
}

module.exports = { resetUserPassword };