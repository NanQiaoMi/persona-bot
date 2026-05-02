// mongo-init.js

db = db.getSiblingDB('personabot');

// 创建用户集合
db.createCollection('users');
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { sparse: true });

// 创建邀请码集合
db.createCollection('invitecodes');
db.invitecodes.createIndex({ code: 1 }, { unique: true });
db.invitecodes.createIndex({ isActive: 1 });

// 创建Persona集合
db.createCollection('personas');
db.personas.createIndex({ userId: 1, slug: 1 }, { unique: true });

// 创建对话集合
db.createCollection('conversations');
db.conversations.createIndex({ userId: 1, personaId: 1 });
db.conversations.createIndex({ lastActivity: -1 });

print('MongoDB初始化完成');
