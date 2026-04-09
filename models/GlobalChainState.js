import mongoose from 'mongoose';
import { sutabandhanConnection } from '../dbConnections.js';

const globalChainStateSchema = new mongoose.Schema(
  {
    lastHash: { type: String, default: 'GENESIS' },
    lastSeq: { type: Number, default: 0 },
    version: { type: Number, default: 0 },
  },
  { collection: 'global_chain_state' }
);

// Helper to get or create the single state document
globalChainStateSchema.statics.getOrCreate = async function (session) {
  let state = await this.findOne().session(session);
  if (!state) {
    state = new this({ lastHash: 'GENESIS', lastSeq: 0, version: 0 });
    await state.save({ session });
  }
  return state;
};

const GlobalChainState = sutabandhanConnection.model('GlobalChainState', globalChainStateSchema);
export default GlobalChainState;