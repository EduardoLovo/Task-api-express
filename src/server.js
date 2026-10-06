const fs = require('node:fs');
const http = require('node:http');
const { randomUUID } = require('node:crypto');

const { loadConfig } = require('./config/env');
const { createDatabase } = require('./db/database');
const { createApp } = require('./app');
const logger = require('./lib/logger');

const SHUTDOWN_TIMEOUT_MS = 10_000;

function main() {
  if (fs.existsSync('.env')) process.loadEnvFile('.env');

  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  let db;
  try {
    db = createDatabase(config.databasePath);
  } catch (err) {
    logger.error('Falha ao abrir o banco de dados', {
      path: config.databasePath,
      error: logger.serializeError(err),
    });
    process.exit(1);
  }

  const app = createApp({ db, config });
  const server = http.createServer(app);

  let shuttingDown = false;
  function shutdown(exitCode) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Encerrando servidor...');

    // Se as conexões não fecharem a tempo, força a saída.
    setTimeout(() => {
      logger.error('Encerramento forçado após timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    server.close((err) => {
      if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') {
        logger.error('Erro ao fechar o servidor', { error: logger.serializeError(err) });
        exitCode = 1;
      }
      try {
        if (db.isOpen) db.close();
      } catch (closeErr) {
        logger.error('Erro ao fechar o banco', { error: logger.serializeError(closeErr) });
        exitCode = 1;
      }
      process.exit(exitCode);
    });
    server.closeIdleConnections();
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Porta ${config.port} já está em uso`);
    } else if (err.code === 'EACCES') {
      logger.error(`Sem permissão para usar a porta ${config.port}`);
    } else {
      logger.error('Erro no servidor HTTP', { error: logger.serializeError(err) });
    }
    shutdown(1);
  });

  // Requisições HTTP malformadas, que nem chegam ao Express.
  server.on('clientError', (err, socket) => {
    if (err.code === 'ECONNRESET' || !socket.writable) {
      socket.destroy();
      return;
    }
    const body = JSON.stringify({
      error: {
        status: 400,
        code: 'BAD_REQUEST',
        message: 'Requisição HTTP malformada',
        details: [],
        requestId: randomUUID(),
      },
    });
    socket.end(
      'HTTP/1.1 400 Bad Request\r\n' +
        'Content-Type: application/json; charset=utf-8\r\n' +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        'Connection: close\r\n\r\n' +
        body,
    );
  });

  server.listen(config.port, () => {
    logger.info(`Servidor rodando em http://localhost:${config.port}`, { env: config.env });
    logger.info(`Documentação em http://localhost:${config.port}/docs`);
  });

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  process.on('unhandledRejection', (reason) => {
    logger.error('Promise rejeitada sem tratamento', { error: logger.serializeError(reason) });
    shutdown(1);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Exceção não capturada', { error: logger.serializeError(err) });
    shutdown(1);
  });
}

main();
