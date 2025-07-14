import mongoose, { Schema, Document } from 'mongoose';

// Interface for Event document
export interface IEvent extends Document {
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

// Schema for Event collection
const EventSchema: Schema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Event description is required'],
      trim: true,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  }
);

// Create and export the Event model
// We need to check if the model already exists to prevent the "Cannot overwrite model once compiled" error in development with hot reloading
export const Event: mongoose.Model<IEvent> = mongoose.models.Event || mongoose.model<IEvent>('Event', EventSchema);
