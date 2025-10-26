import config from './config/local.js';
import express from 'express';
import cors from 'cors';
import { createHash } from 'node:crypto';
import user from './src/user/user.js';
import associate from './src/associate/associate.js';
import messaging from './src/messaging/messaging.js';
import MAGIC from './src/magic/magic.js';
import fount from 'fount-js';
import bdo from 'bdo-js';
import sessionless from 'sessionless-node';
import db from './src/persistence/db.js';

const sk = (keys) => {
  global.keys = keys;
};

const gk = () => {
  return keys;
};

sessionless.generateKeys(sk, gk);

const app = express();
app.use(cors());
app.use(express.json());

const SUBDOMAIN = process.env.SUBDOMAIN || 'dev';
fount.baseURL = process.env.LOCALHOST ? 'http://localhost:3006/' : `${SUBDOMAIN}.fount.allyabase.com/`;
bdo.baseURL = process.env.LOCALHOST ? 'http://localhost:3003/' : `${SUBDOMAIN}.bdo.allyabase.com/`;

const bdoHashInput = `${SUBDOMAIN}continuebee`;

const bdoHash = createHash('sha256').update(bdoHashInput).digest('hex');

const repeat = (func) => {
  setTimeout(func, 2000);
};

const bootstrap = async () => {
  try {
    const fountUser = await fount.createUser(db.saveKeys, db.getKeys);
    const bdoUUID = await bdo.createUser(bdoHash, {}, () => {}, db.getKeys);
    const spellbooks = await bdo.getSpellbooks(bdoUUID, bdoHash);
    const julia = {
      uuid: 'julia',
      fountUUID: fountUser.uuid,
      fountPubKey: fountUser.pubKey,
      bdoUUID,
      keys: {interactingKeys: {}, coordinatingKeys: {}},
      spellbooks
    };

    if(!julia.fountUUID || !julia.bdoUUID || !spellbooks) {
      throw new Error('bootstrap failed');
    }

    await db.saveUser(julia);
  } catch(err) {
    repeat(bootstrap);
  }
};

repeat(bootstrap);

app.use((req, res, next) => {
  const requestTime = +req.query.timestamp || +req.body.timestamp;
  const now = new Date().getTime();
  if(Math.abs(now - requestTime) > config.allowedTimeDifference) {
    return res.send({error: 'no time like the present'});
  }
  next();
});

app.put('/user/create', async (req, res) => {
  try {
    const pubKey = req.body.pubKey;
    const message = req.body.timestamp +  pubKey;
    const signature = req.body.signature;

    console.log('PubKey type:', typeof pubKey);
    console.log('PubKey value:', pubKey);
    console.log('Signature type:', typeof signature);
    console.log('Signature value:', signature);

    if(!signature || !sessionless.verifySignature(signature, message, pubKey)) {
      res.status(403);
      return res.send({error: 'auth error'});
    }

    const foundUser = await user.putUser(req.body.user);
    res.send(foundUser);
  } catch(err) {
    console.log('Error in /user/create:', err);
    res.status(404);
    res.send({error: 'not found'});
  }
});

app.get('/user/:uuid', async (req, res) => {
  try {
    const uuid = req.params.uuid;
    const timestamp = req.query.timestamp;
    const signature = req.query.signature;
    const message = timestamp + uuid;
console.log('getting user: ', uuid);
   
    const foundUser = await user.getUser(req.params.uuid);

    if(!signature || !sessionless.verifySignature(signature, message, foundUser.pubKey)) {
      res.status(403);
      return res.send({error: 'auth error'});
    }

    res.send(foundUser);
  } catch(err) {
console.log(err);
    res.status(404);
    res.send({error: 'not found'});
  }
});

app.get('/user/:uuid/associate/prompt', async (req, res) => {
  try {
console.log('getting a prompt');
    const uuid = req.params.uuid;
    const timestamp = req.query.timestamp;
    const signature = req.query.signature;
    const message = timestamp + uuid;

    const foundUser = await user.getUser(req.params.uuid);
console.log('found a user');

    if(!signature || !sessionless.verifySignature(signature, message, foundUser.pubKey)) {
console.log('here for some reason');
      res.status(403);
      return res.send({error: 'auth error'});
    }
console.log('userWithPrompt coming');

    const userWithPrompt = await associate.getPrompt(foundUser);

  console.log('\n\n\n');
  console.log('Start with: ', userWithPrompt.pendingPrompts);
  console.log('\n\n\n');

  //console.log('sending back: ', userWithPrompt);

    res.send(userWithPrompt);
  } catch(err) {
console.warn(err);
    res.status(404);
    res.send({error: 'not found'});
  }
});

app.post('/user/:uuid/associate/signedPrompt', async (req, res) => {
//console.log('rew.body is', req.body);
  try {
  console.log('\n\n\n');
  console.log('signed prompt', req.body.prompt);
  console.log('\n\n\n');
    const uuid = req.params.uuid;
    const timestamp = req.body.timestamp;
    const pubKey = req.body.pubKey;
    const prompt = req.body.prompt;
    const signature = req.body.signature;
    const message = timestamp + uuid + pubKey + prompt;
  console.log(message);

    const foundUser = await user.getUser(req.params.uuid);

  console.log('after found user');

    if(!signature || !sessionless.verifySignature(signature, message, foundUser.pubKey)) {
  console.log('auth failed');
      res.status(403);
      return res.send({error: 'auth error'});
    }

  console.log('uuid here is: ' + req.body.uuid);
    
    const result = await associate.saveSignedPrompt(foundUser, req.body);
  console.log('should return success: ' + result);
    res.send({success: result});
  } catch(err) {
    res.status(404);
    res.send({error: 'not found'});
  }
});

app.post('/user/:uuid/associate', async (req, res) => {
  try {
  console.log("\n\n\n\n\n\n");
  console.log('associated prompt', req.body.prompt);
  console.log("\n\n\n\n\n\n");
  console.log('body', req.body);
    const uuid = req.params.uuid;
    const newTimestamp = req.body.newTimestamp;
    const newUUID = req.body.newUUID;
    const newPubKey = req.body.newPubKey;
    const prompt = req.body.prompt;
    const signature = req.body.signature;
    const newSignature = req.body.newSignature;
    const message = newTimestamp + newUUID + newPubKey + prompt;

    const foundUser = await user.getUser(req.params.uuid);
console.log(foundUser);
console.log('prompt', prompt);
console.log('newUUID', newUUID);

    if(!foundUser.pendingPrompts[prompt] || 
       !(foundUser.pendingPrompts[prompt].prompter === foundUser.uuid && 
       foundUser.pendingPrompts[prompt].newUUID === newUUID)) {
console.log(!foundUser.pendingPrompts[prompt]);
console.log(!(foundUser.pendingPrompts[prompt].prompter === foundUser.uuid &&
             foundUser.pendingPrompts[prompt].newUUID === newUUID));
console.log(foundUser.pendingPrompts[prompt].newUUID === newUUID);
  console.log("first check failed");
      res.status(404);
      return res.send({error: 'prompt not found'});
    }

  console.log('message here is: ' + message);

    if(!signature || !sessionless.associate(signature, message, foundUser.pubKey, newSignature, message, newPubKey)) {
  console.log('association signatures failes');
  console.log(signature);
  console.log(newSignature);
  console.log(foundUser.pubKey);
  console.log(newPubKey);
      res.status(403);
      return res.send({error: 'auth error'});
    } 

    const associatedUser = await user.getUser(newUUID);
    const updatedUser = await associate.associate(foundUser, associatedUser);
    await associate.removePrompt(foundUser, prompt);
    const doubleUpdatedUser = await user.getUser(uuid);

  console.log("sending back doubleUpdatedUser", doubleUpdatedUser);

    res.send(doubleUpdatedUser);
  } catch(err) {
    res.status(404);
    res.send({error: 'not found'});
  }
});

app.post('/magic/spell/:spellName', async (req, res) => {
console.log('got spell req');
  try {
    const spellName = req.params.spellName;
    const spell = req.body;
    
    if(!MAGIC[spellName]) {
console.log('sending this back');
      res.status(404); 
      res.send({error: 'spell not found'});
    }
    
    let spellResp = {};
    spellResp = await MAGIC[spellName](spell);
console.log('spellResp', spellResp);
    res.status(spellResp.success ? 200 : 900);
    return res.send(spellResp);
  } catch(err) {
console.warn(err);
    res.status(404);
    res.send({error: 'not found'});
  }
});

app.delete('/associated/:associatedUUID/user/:uuid', async (req, res) => {
  try {
    const associatedUUID = req.params.associatedUUID;
    const uuid = req.params.uuid;
    const timestamp = req.body.timestamp;
    const signature = req.body.signature;
    const message = timestamp + associatedUUID + uuid;

    const foundUser = await user.getUser(req.params.uuid);

    if(!signature || !sessionless.verifySignature(signature, message, foundUser.pubKey)) {
      res.status(403);
      return res.send({error: 'auth error'});
    }

    const associatedUser = await user.getUser(associatedUUID);
    const disassociated = await associate.deleteAssociation(foundUser, associatedUser);

    if(disassociated) {
  console.log("disassociated!");
      const updatedUser = await user.getUser(req.params.uuid);
      return res.send(updatedUser);
    }
  console.log("It failed");

    res.send(foundUser);
  } catch(err) {
    res.status(404);
    res.send({error: 'not found'});
  }
});

app.delete('/user/:uuid', async (req, res) => {
  try {
    const uuid = req.params.uuid;
    const timestamp = req.body.timestamp;
    const signature = req.body.signature;
    const message = timestamp + uuid;

    const foundUser = await user.getUser(req.params.uuid);

    if(!signature || !sessionless.verifySignature(signature, message, foundUser.pubKey)) {
      res.status(403);
      return res.send({error: 'auth error'});
    }

    const result = await user.deleteUser(foundUser);
    
    res.send({success: result});
  } catch(err) {
    res.status(404);
    res.send({error: 'not found'});
  }
});

app.post('/message', async (req, res) => {
  try {
console.log('message body', req.body);
    const timestamp = req.body.timestamp;
    const senderUUID = req.body.senderUUID;
    const receiverUUID = req.body.receiverUUID;
    const message = req.body.message;
    const signature = req.body.signature;
    const msg = timestamp + senderUUID + receiverUUID + message;
console.log('message for post message is:', msg);

    const sender = await user.getUser(senderUUID);

  console.log('got stuff');

    if(!signature || !sessionless.verifySignature(signature, msg, sender.pubKey)) {
  console.log('auth error in post message');
      res.status(403);
      return res.send({error: 'auth error'});
    }

    const receiver = await user.getUser(receiverUUID);
  console.log('got receiver');

    if(!receiver) {
      return res.send({success: false});
    }

    const result = await messaging.messageUser(sender, receiver, req.body);

    res.send({success: result});
  } catch(err) {
console.log('YOu\'re erroring on the post message', err);
    res.status(404);
    res.send({error: 'not found'});
  }
});

app.get('/messages/user/:uuid', async (req, res) => {
  try {
    const timestamp = req.query.timestamp;
    const uuid = req.params.uuid;
    const signature = req.query.signature;
    const message = timestamp + uuid;

    const foundUser = await user.getUser(req.params.uuid);

    if(!signature || !sessionless.verifySignature(signature, message, foundUser.pubKey)) {
      res.status(403);
      return res.send({error: 'auth error'});
    }

    const messages = await messaging.getMessages(foundUser);
    res.send({ messages });
  } catch(err) {
    res.status(404);
    res.send({error: 'not found'});
  }
});

app.get('/authteam', async (req, res) => {
  try {
    // Generate random colored button sequence for authteam game
    const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
    const sequenceLength = 5; // 4 buttons + 1 final coordination button
    const sequence = [];

    for (let i = 0; i < sequenceLength; i++) {
      sequence.push(colors[Math.floor(Math.random() * colors.length)]);
    }

    // Return authteam magistack HTML
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Julia AuthTeam - Coordinating Keys</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 600px;
      text-align: center;
    }
    h1 {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .subtitle {
      font-size: 18px;
      opacity: 0.9;
      margin-bottom: 40px;
    }
    .instruction {
      background: rgba(255,255,255,0.2);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
      font-size: 20px;
      font-weight: bold;
    }
    .button-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    .color-button {
      width: 100%;
      aspect-ratio: 1;
      border: none;
      border-radius: 50%;
      font-size: 24px;
      font-weight: bold;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      color: white;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
    }
    .color-button:hover {
      transform: scale(1.1);
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .color-button:active {
      transform: scale(0.95);
    }
    .color-button.red { background: #e74c3c; }
    .color-button.blue { background: #3498db; }
    .color-button.green { background: #2ecc71; }
    .color-button.yellow { background: #f1c40f; color: #333; }
    .color-button.purple { background: #9b59b6; }
    .color-button.orange { background: #e67e22; }
    .sequence-display {
      background: rgba(0,0,0,0.3);
      border-radius: 12px;
      padding: 15px;
      margin-bottom: 20px;
      font-family: monospace;
      font-size: 18px;
    }
    .status {
      font-size: 24px;
      font-weight: bold;
      min-height: 40px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎮 AuthTeam</h1>
    <div class="subtitle">Coordinating Keys Challenge</div>

    <div class="instruction">
      Press the colored buttons in the correct sequence to add a coordinating key!
    </div>

    <div class="sequence-display">
      Target: <span id="targetSequence">${sequence.join(' → ')}</span>
    </div>

    <div class="sequence-display">
      Your Input: <span id="playerSequence">-</span>
    </div>

    <div class="button-grid">
      ${colors.map(color => `
        <button class="color-button ${color}" onclick="pressButton('${color}')">
          ${color.toUpperCase()}
        </button>
      `).join('')}
    </div>

    <div class="status" id="status">Ready to begin!</div>
  </div>

  <script>
    const targetSequence = ${JSON.stringify(sequence)};
    let playerInput = [];

    function pressButton(color) {
      playerInput.push(color);
      document.getElementById('playerSequence').textContent = playerInput.join(' → ');

      // Check if input matches so far
      for (let i = 0; i < playerInput.length; i++) {
        if (playerInput[i] !== targetSequence[i]) {
          document.getElementById('status').textContent = '❌ Wrong sequence! Try again.';
          document.getElementById('status').style.color = '#e74c3c';
          setTimeout(() => {
            playerInput = [];
            document.getElementById('playerSequence').textContent = '-';
            document.getElementById('status').textContent = 'Ready to begin!';
            document.getElementById('status').style.color = 'white';
          }, 1500);
          return;
        }
      }

      // Check if complete
      if (playerInput.length === targetSequence.length) {
        document.getElementById('status').textContent = '✅ Success! Coordinating key added!';
        document.getElementById('status').style.color = '#2ecc71';

        // This is where we would call the Julia endpoint to add coordinating keys
        // For now, just show success
        setTimeout(() => {
          playerInput = [];
          document.getElementById('playerSequence').textContent = '-';
          document.getElementById('status').textContent = 'Ready for next key!';
          document.getElementById('status').style.color = 'white';
        }, 2000);
      }
    }
  </script>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch(err) {
    console.warn(err);
    res.status(500);
    res.send({error: 'authteam generation failed'});
  }
});

app.post('/user/:uuid/coordinate', async (req, res) => {
  try {
    const primaryUUID = req.params.uuid;
    const coordinatingPubKey = req.body.pubKey;
    const coordinatingUuid = req.body.uuid;
    const timestamp = req.body.timestamp;
    const signature = req.body.signature;

    // Verify the signature from the coordinating user
    const message = timestamp + primaryUUID + coordinatingPubKey + coordinatingUuid;
    const primaryUser = await user.getUser(primaryUUID);

    console.log('Coordinate request:');
    console.log('  message:', message);
    console.log('  signature:', signature);
    console.log('  coordinatingPubKey:', coordinatingPubKey);

    let verifyResult = false;
    try {
      verifyResult = sessionless.verifySignature(signature, message, coordinatingPubKey);
    } catch (verifyErr) {
      // Invalid signature format
      console.log('  verifySignature error:', verifyErr.message);
    }
    console.log('  verifyResult:', verifyResult);

    if (!signature || !verifyResult) {
      res.status(403);
      return res.send({ error: 'auth error' });
    }

    // Add coordinating key to primary user
    const updatedUser = await db.coordinateKeys(primaryUser, coordinatingPubKey, coordinatingUuid);

    res.send({
      success: true,
      coordinatingKeys: updatedUser.keys.coordinatingKeys
    });
  } catch (err) {
    console.error('Error coordinating keys:', err);
    res.status(500);
    res.send({ error: 'failed to coordinate keys' });
  }
});

// NFC verification endpoint
app.post('/nfc/verify', async (req, res) => {
  try {
    console.log('NFC verification request received');
    const primaryUUID = req.body.primaryUUID;
    const pubKey = req.body.pubKey;
    const signature = req.body.signature;
    const timestamp = req.body.timestamp;

    if (!primaryUUID || !pubKey || !signature) {
      console.log('Missing required fields');
      return res.status(400).send({ error: 'Missing required fields: primaryUUID, pubKey, signature' });
    }

    // Get primary user
    const primaryUser = await user.getUser(primaryUUID);
    if (!primaryUser) {
      console.log('Primary user not found:', primaryUUID);
      return res.status(404).send({ error: 'Primary user not found' });
    }

    console.log('NFC verify - Fetching BDO for pubKey:', pubKey);

    // Fetch BDO using pubKey
    let bdoData;
    try {
      bdoData = await bdo.getBDO(pubKey, bdoHash, () => {}, db.getKeys);
    } catch (bdoErr) {
      console.log('Failed to fetch BDO:', bdoErr.message);
      return res.status(404).send({
        success: false,
        error: 'BDO not found for this pubKey',
        details: bdoErr.message
      });
    }

    console.log('BDO fetched successfully');

    // Extract message from BDO
    const bdoMessage = bdoData.data?.message;
    if (!bdoMessage) {
      console.log('No message found in BDO');
      return res.status(400).send({
        success: false,
        error: 'BDO does not contain a message field'
      });
    }

    console.log('BDO message:', bdoMessage);
    console.log('Verifying signature...');

    // Verify signature against BDO message
    let isValid = false;
    try {
      isValid = sessionless.verifySignature(signature, bdoMessage, pubKey);
    } catch (verifyErr) {
      console.log('Signature verification error:', verifyErr.message);
      return res.status(403).send({
        success: false,
        error: 'Invalid signature format',
        details: verifyErr.message
      });
    }

    if (!isValid) {
      console.log('Signature verification failed');
      return res.status(403).send({
        success: false,
        error: 'Signature verification failed'
      });
    }

    console.log('✅ Signature verified successfully');

    // Check if rotation is needed
    const shouldRotate = bdoData.data?.rotate === true;
    let newPubKey = null;
    let rotationUUID = null;

    if (shouldRotate) {
      console.log('🔄 Rotating key - creating new BDO with new pubKey');

      // Generate new keys for rotation
      const newKeys = {pubKey: '', privateKey: ''};
      await sessionless.generateKeys(
        (keys) => { newKeys.pubKey = keys.pubKey; newKeys.privateKey = keys.privateKey; },
        () => { return newKeys; }
      );

      // Create new BDO with rotated data
      const rotatedBDOData = {
        ...bdoData.data,
        previousPubKey: pubKey,
        rotated: true,
        rotatedAt: new Date().toISOString()
      };

      try {
        const newBDO = await bdo.createBDO(newKeys.pubKey, bdoHash, rotatedBDOData, () => {}, db.getKeys);
        newPubKey = newKeys.pubKey;
        rotationUUID = newBDO.uuid;
        console.log('✅ New BDO created with pubKey:', newPubKey);
      } catch (rotateErr) {
        console.log('❌ Failed to create rotated BDO:', rotateErr.message);
        // Continue anyway - we verified the signature
      }
    }

    // Determine if coordinating or interacting key
    const isCoordinating = bdoData.data?.coordinating === true;
    const keyType = isCoordinating ? 'coordinating' : 'interacting';

    console.log(`Adding ${keyType} key to primary user`);

    // Add key to primary user
    let updatedUser;
    if (isCoordinating) {
      // Create a UUID for this coordinating key (use rotation UUID if available)
      const coordinatingUUID = rotationUUID || createHash('sha256').update(pubKey).digest('hex').substring(0, 36);
      updatedUser = await db.coordinateKeys(primaryUser, pubKey, coordinatingUUID);
    } else {
      // For interacting keys, create a temporary user and associate
      const interactingUUID = createHash('sha256').update(pubKey).digest('hex').substring(0, 36);
      const interactingUser = {
        uuid: interactingUUID,
        pubKey: pubKey,
        keys: {interactingKeys: {}, coordinatingKeys: {}}
      };

      // Save interacting user if it doesn't exist
      try {
        await user.getUser(interactingUUID);
      } catch (err) {
        // User doesn't exist, create it
        await db.saveUser(interactingUser);
      }

      // Associate the users
      updatedUser = await associate.associate(primaryUser, interactingUser);
    }

    console.log('✅ Key added successfully');

    // Build response
    const response = {
      success: true,
      message: `Key verified and added as ${keyType} key`,
      keyType: keyType,
      pubKey: pubKey
    };

    if (shouldRotate && newPubKey) {
      response.rotated = true;
      response.newPubKey = newPubKey;
      response.rotationUUID = rotationUUID;
    }

    res.send(response);
  } catch (err) {
    console.error('NFC verification error:', err);
    res.status(500).send({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

// Wand registration endpoint
app.post('/wand/register', async (req, res) => {
  try {
    console.log('🪄 Wand registration request received');
    const primaryUUID = req.body.primaryUUID;
    const pubKey = req.body.pubKey;
    const wandName = req.body.wandName;
    const timestamp = req.body.timestamp;

    if (!primaryUUID || !pubKey || !wandName) {
      console.log('Missing required fields');
      return res.status(400).send({
        success: false,
        error: 'Missing required fields: primaryUUID, pubKey, wandName'
      });
    }

    // Get primary user
    const primaryUser = await user.getUser(primaryUUID);
    if (!primaryUser) {
      console.log('Primary user not found:', primaryUUID);
      return res.status(404).send({
        success: false,
        error: 'Primary user not found'
      });
    }

    console.log(`🪄 Registering wand "${wandName}" with pubKey: ${pubKey.substring(0, 16)}...`);

    // Create a UUID for this coordinating key (wand)
    const wandUUID = createHash('sha256').update(pubKey + wandName).digest('hex').substring(0, 36);

    // Add wand pubKey as coordinating key
    const updatedUser = await db.coordinateKeys(primaryUser, pubKey, wandUUID);

    console.log('✅ Wand registered successfully');

    // Build response
    const response = {
      success: true,
      message: `Wand "${wandName}" registered as coordinating key`,
      wandName: wandName,
      pubKey: pubKey,
      wandUUID: wandUUID
    };

    res.send(response);
  } catch (err) {
    console.error('❌ Wand registration error:', err);
    res.status(500).send({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

app.listen(process.env.PORT || 3000);

console.log('julia\'s ready for connections on port 3000');
