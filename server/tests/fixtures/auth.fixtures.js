const AUTH_PASSWORD = 'Password123!';
const HASHED_PASSWORD = 'hashed-password';

function buildUser({
  userId = 100,
  authUid = `auth-${userId}`,
  firstName = 'Test',
  lastName = 'User',
  email = `user${userId}@example.com`,
  role = 'student',
  isActive = true,
} = {}) {
  return {
    UserID: userId,
    AuthUID: authUid,
    FirstName: firstName,
    LastName: lastName,
    Email: email.toLowerCase(),
    PasswordHash: HASHED_PASSWORD,
    IsActive: isActive,
    UserRole: [
      {
        Role: {
          RoleName: role,
        },
      },
    ],
  };
}

function buildLoginPayload(email, password = AUTH_PASSWORD) {
  return {
    email,
    password,
  };
}

module.exports = {
  AUTH_PASSWORD,
  HASHED_PASSWORD,
  buildLoginPayload,
  buildUser,
};
