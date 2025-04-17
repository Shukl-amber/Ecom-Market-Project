const mongoose = require('mongoose');

// Product Schema
const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  brand: { type: String, required: true },
  stock: { type: Number, required: true },
  images: [{
    path: String,
    isCover: { type: Boolean, default: false }
  }],
  sellerId: { type: String, required: true }
});

// User Schema
const UserSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true
  },
  password: { 
    type: String, 
    required: true
  },
  userType: { 
    type: String, 
    enum: ['buyer', 'seller'], 
    required: true 
  },
  name: { 
    type: String, 
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  // Buyer specific fields
  address: {
    type: String,
    required: function() { return this.userType === 'buyer'; }
  },
  // Seller specific fields
  shopName: {
    type: String,
    required: function() { return this.userType === 'seller'; }
  },
  bankAccount: {
    type: String,
    required: function() { return this.userType === 'seller'; }
  },
  panNumber: {
    type: String,
    required: function() { return this.userType === 'seller'; }
  }
});

// Cart Schema
const CartSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 1 }
  }]
});

// Create and export models
const Product = mongoose.model('Product', ProductSchema);
const User = mongoose.model('User', UserSchema);
const Cart = mongoose.model('Cart', CartSchema);

module.exports = {
  Product,
  User,
  Cart
};