const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { conflict, unauthorized } = require('../../errors/AppError');
const { MAX_PASSWORD_BYTES } = require('./auth.schemas');

const JWT_ALGORITHM = 'HS256';

function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function createAuthService({ userRepository, config }) {
  // Hash usado quando o e-mail não existe, para que o tempo de resposta do login
  // não revele se a conta existe ou não.
  const dummyHash = bcrypt.hashSync('dummy-password-for-timing', config.bcryptRounds);

  function issueToken(user) {
    const token = jwt.sign({}, config.jwt.secret, {
      subject: String(user.id),
      expiresIn: config.jwt.expiresIn,
      algorithm: JWT_ALGORITHM,
    });
    return { accessToken: token, tokenType: 'Bearer', expiresIn: config.jwt.expiresIn };
  }

  return {
    async register({ name, email, password }) {
      if (userRepository.findByEmail(email)) {
        throw conflict('EMAIL_ALREADY_EXISTS', 'Este e-mail já está cadastrado');
      }
      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
      const user = userRepository.create({ name, email, passwordHash });
      return { user: toPublicUser(user), ...issueToken(user) };
    },

    async login({ email, password }) {
      const user = userRepository.findByEmail(email);
      // Senha acima do limite nunca foi cadastrada; o bcrypt truncaria e poderia
      // aceitar só pelo prefixo. Compara com o hash fictício para manter o tempo.
      const tooLong = Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES;
      const hash = user && !tooLong ? user.passwordHash : dummyHash;
      const valid = await bcrypt.compare(password, hash);
      if (!user || tooLong || !valid) {
        throw unauthorized('INVALID_CREDENTIALS', 'E-mail ou senha inválidos');
      }
      return { user: toPublicUser(user), ...issueToken(user) };
    },

    /** Valida o token e retorna o usuário dono dele. Lança 401 em qualquer falha. */
    authenticate(token) {
      let payload;
      try {
        payload = jwt.verify(token, config.jwt.secret, { algorithms: [JWT_ALGORITHM] });
      } catch (err) {
        if (err.name === 'TokenExpiredError') {
          throw unauthorized('TOKEN_EXPIRED', 'Token expirado, faça login novamente');
        }
        throw unauthorized('INVALID_TOKEN', 'Token inválido');
      }

      const userId = Number(payload.sub);
      const user = Number.isInteger(userId) ? userRepository.findById(userId) : null;
      if (!user) {
        throw unauthorized('INVALID_TOKEN', 'Token inválido');
      }
      return toPublicUser(user);
    },
  };
}

module.exports = { createAuthService };
