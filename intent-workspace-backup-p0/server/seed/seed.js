import 'dotenv/config';
import mongoose from 'mongoose';
import Dataset from '../models/Dataset.js';
import data from './data.js';
await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/intent_workspace');
for (const [key, value] of Object.entries(data)) await Dataset.updateOne({ key }, { value }, { upsert: true });
console.log('Seeded', Object.keys(data).length, 'datasets');
await mongoose.disconnect();
