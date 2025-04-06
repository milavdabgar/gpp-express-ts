import mongoose, { Document, Schema } from 'mongoose';

export interface IRole extends Document {
  name: string;
  description: string;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Role name is required'],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Role description is required']
  },
  permissions: {
    type: [String],
    required: [true, 'Permissions are required'],
    enum: ['create', 'read', 'update', 'delete']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

export const RoleModel = mongoose.model<IRole>('Role', roleSchema);
