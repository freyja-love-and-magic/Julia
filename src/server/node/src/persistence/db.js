import config from '../../config/local.js';
import { createClient } from './client.js';
import sessionless from 'sessionless-node';
  
const client = await createClient()
  .on('error', err => console.log('Redis Client Error', err))
  .connect();
    
const db = {
  getUser: async (uuid) => {
    const user = await client.get(`user:${uuid}`);
    if(!user) {
      throw new Error('not found');
    }
    let parsedUser = JSON.parse(user);
console.log(`parsedUser: ${JSON.stringify(parsedUser)}`);
console.log(uuid);
    const currentKeys = await sessionless.getKeys();
if(!parsedUser) {
  parsedUser = {uuid};
  parsedUser.keys = { // This should only be the case for Julia until I update how that works.
    interactingKeys: {},
    coordinatingKeys: {}
  };
}
    parsedUser.keys.interactingKeys.julia = currentKeys.pubKey;
console.log('about to get pendingPrompts');
    parsedUser.pendingPrompts = await db.getPendingPrompts(parsedUser);
console.log(`pendingPrompts: ${JSON.stringify(parsedUser.pendingPrompts)}`);
console.log('messages next');
    parsedUser.messages = await db.getMessages(parsedUser);
console.log('messages: ', parsedUser.messages);
    return parsedUser; 
  },

  putUser: async (user) => {
    const uuid = sessionless.generateUUID();
    user.uuid = uuid;
    user.keys = {
      interactingKeys: {},
      coordinatingKeys: {}
    };
    await client.set(`user:${uuid}`, JSON.stringify(user));
    return uuid;
  },

  saveUser: async (user) => {
    await client.set(`user:${user.uuid}`, JSON.stringify(user));
    return true;
  },

  deleteUser: async (user) => {
    const resp = await client.del(`user:${user.uuid}`);

    return true;
  },

  startPrompt: async (user, prompt) => {
    const promptToAdd = {
      timestamp: new Date().getTime() + '', 
      prompter: user.uuid,
      prompt
    };

    await client.set(`prompt:${prompt}`, JSON.stringify(promptToAdd));
    const promptSet = JSON.parse((await client.get(`prompt:${user.uuid}`)) || '{}');
    promptSet[prompt] = promptToAdd;;
    await client.set(`prompt:${user.uuid}`, JSON.stringify(promptSet));
console.log('set', `prompt:${user.uuid}`, JSON.stringify(promptSet));

    const pendingPrompts = await db.getPendingPrompts(user);
    pendingPrompts[prompt] = promptToAdd;

console.log('pendingPrompts', pendingPrompts);

    return pendingPrompts;
  },

  saveSignedPrompt: async (user, saveSignedPrompt) => {
    const currentPromptString = await client.get(`prompt:${saveSignedPrompt.prompt}`);
    if(!currentPromptString) {
console.log('no prompt');
      return false;
    }
    const currentPrompt = JSON.parse(currentPromptString);
    const now = new Date().getTime();

    if(now - +currentPrompt.timestamp > config.promptTimeLimit) {
console.log('timestamp isn\'t good anymore');
      const promptSet = JSON.parse((await client.get(`prompt:${user.uuid}`)) || '{}');
      delete promptSet[saveSignedPrompt.prompt];
      await client.set(`prompt:${user.uuid}`, JSON.stringify(promptSet));
      await client.del(`prompt:${saveSignedPrompt.prompt}`);
      return false;
    }

    if(!currentPrompt) {
      return false;
    }

    currentPrompt.newTimestamp = saveSignedPrompt.timestamp;
    currentPrompt.newUUID = saveSignedPrompt.uuid;
console.log('uuid on currentPrompt is: ' + currentPrompt.newUUID);
    currentPrompt.newPubKey = saveSignedPrompt.pubKey;
    currentPrompt.prompt = saveSignedPrompt.prompt;
    currentPrompt.newSignature = saveSignedPrompt.signature;

    await client.set(`prompt:${saveSignedPrompt.prompt}`, JSON.stringify(currentPrompt));
console.log('signed', `prompt:${saveSignedPrompt.prompt}`, JSON.stringify(currentPrompt));
    
    return true;
  },

  getPendingPrompts: async (user) => {
    const promptSetJSON = (await client.get(`prompt:${user.uuid}`)) || '{}';
    const promptSet = JSON.parse(promptSetJSON);
console.log(`prompt:${user.uuid}`);
console.log(promptSet);
    const promptKeys = Object.keys(promptSet);
    let prompts = {};
    for(let i = 0; i < promptKeys.length; i++) {
/*      const prompt = promptKeys[i].split(':')[1];
      await client.sendCommand(['SREM', `prompt:${user.uuid}`, `prompt:${prompt}`]);
      await client.sendCommand(['DEL', `prompt:${prompt}`]);
*/      const prompt = await client.get(`prompt:${promptKeys[i]}`);
console.log('PROMPT', `prompt:${promptKeys[i]}`);
      if(!prompt) {
        continue;
      }
      const parsedPrompt = JSON.parse(prompt); 
      if(parsedPrompt.newPubKey) {
        prompts[parsedPrompt.prompt] = parsedPrompt;
      } else {
console.log('THE PROBLEM IS THAT newPubKey DOESN\'T EXIST');
      }
    }

    return prompts;
  },

  associateUsers: async (user, associatedUser) => {
    user.keys.interactingKeys[associatedUser.uuid] = associatedUser.pubKey;
    associatedUser.keys.interactingKeys[user.uuid] = user.pubKey;

    const saved = (await db.saveUser(user) && await db.saveUser(associatedUser));
    return user;
  },

  removePrompt: async (user, prompt) => {
    const promptSet = JSON.parse((await client.get(`prompt:${user.uuid}`)) || '{}');
    delete promptSet[prompt];
    await client.set(`prompt:${user.uuid}`, JSON.stringify(promptSet));
    await client.del(`prompt:${prompt}`);   
  },

  deleteAssociation: async (user, associatedUser) => {
    delete user.keys.interactingKeys[associatedUser.uuid];
    delete associatedUser.keys.interactingKeys[user.uuid];

    await db.saveUser(user);
    await db.saveUser(associatedUser);

    return true;
  },

  messageUser: async (sender, receiver, message) => {
    const senderMessages =  await client.get(`${sender.uuid}:messages`) || [];
    const receiverMessages = await client.get(`${receiver.uuid}:messages`) || [];

    senderMessages.push(message);
    receiverMessages.push(message);
  
    await client.set(`${sender.uuid}:messages`, JSON.stringify(senderMessages));
    await client.set(`${receiver.uuid}:messages`, JSON.stringify(receiverMessages));

    return true;
  },

  getMessages: async (user) => {
    const messages = (await client.get(`${user.uuid}:messages`)) || '[]';
    return JSON.parse(messages);
  },

  saveKeys: async (keys) => {
    await client.set(`keys`, JSON.stringify(keys));
  },

  getKeys: async () => {
    const keyString = await client.get('keys');
    return JSON.parse(keyString);
  },

  coordinateKeys: async (primaryUser, coordinatingPubKey, coordinatingUuid) => {
    // Add the coordinating key to the primary user's coordinatingKeys
    primaryUser.keys.coordinatingKeys[coordinatingUuid] = coordinatingPubKey;

    await db.saveUser(primaryUser);
    return primaryUser;
  }

};

export default db;
