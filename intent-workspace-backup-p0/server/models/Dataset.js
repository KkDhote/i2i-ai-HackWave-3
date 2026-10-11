import mongoose from 'mongoose';
const schema = new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed });
export default mongoose.model('Dataset', schema);
