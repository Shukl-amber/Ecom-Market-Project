// Import required dependencies
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Initialize Express app
const app = express();

// Middleware setup
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection setup
mongoose.connect('mongodb://localhost:27017/mydb', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB successfully');
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Handle MongoDB connection events
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

// Graceful shutdown on SIGINT
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  // Set the destination directory for uploaded files
  destination: (req, file, cb) => cb(null, 'uploads/'),
  // Generate unique filenames for uploaded files
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s+/g, '-'));
  }
});

// Configure file upload restrictions
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
    files: 5 // Maximum number of files
  },
  fileFilter
});

// Error handler middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 5MB.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum is 5 files.' });
    }
    return res.status(400).json({ error: err.message });
  }
  next(err);
};

app.use(handleMulterError);

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Define MongoDB schemas and models
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

const CartSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 1 }
  }]
});

// Create models from schemas
const Product = mongoose.model('Product', ProductSchema);
const User = mongoose.model('User', UserSchema);
const Cart = mongoose.model('Cart', CartSchema);

// API Routes for user authentication
app.post('/api/login', async (req, res) => {
  const { email, password, userType } = req.body;
  try {
    const user = await User.findOne({ email, password, userType });
    if (user) {
      res.json({ 
        found: true, 
        name: user.name, 
        userId: user._id
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/signup', async (req, res) => {
  try {
    const { email } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const user = await new User(req.body).save();
    await new Cart({ userId: user._id, items: [] }).save();
    
    res.json({ 
      name: user.name, 
      userId: user._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API Routes for product management
app.get('/api/products', async (req, res) => {
  const { sort } = req.query;
  const sortOption = sort === 'price_asc' ? { price: 1 } : 
                    sort === 'price_desc' ? { price: -1 } : {};
  
  try {
    const products = await Product.find().sort(sortOption);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/seller/:sellerId', async (req, res) => {
  try {
    const products = await Product.find({ sellerId: req.params.sellerId });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    const { name, price, description, category, brand, stock, sellerId } = req.body;
    
    // Validate required fields
    if (!name || !price || !description || !category || !brand || !stock || !sellerId) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const images = req.files.map((file, index) => ({
      path: `/uploads/${file.filename}`,
      isCover: index === 0
    }));

    const product = await new Product({
      name,
      price: Number(price),
      description,
      category,
      brand,
      stock: Number(stock),
      sellerId,
      images
    }).save();
    
    res.json(product);
  } catch (error) {
    // Clean up uploaded files if product creation fails
    if (req.files) {
      req.files.forEach(file => {
        fs.unlink(file.path, err => {
          if (err) console.error('Error deleting file:', err);
        });
      });
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', upload.array('images', 5), async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Update basic fields
    const { name, price, category, brand, stock, description } = req.body;
    
    product.name = name;
    product.price = Number(price);
    product.category = category;
    product.brand = brand;
    product.stock = Number(stock);
    product.description = description;

    // Handle new images if provided
    if (req.files && req.files.length > 0) {
      // Delete old images
      product.images.forEach(image => {
        const imagePath = path.join(__dirname, image.path);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      });

      // Add new images
      product.images = req.files.map((file, index) => ({
        path: `/uploads/${file.filename}`,
        isCover: index === 0
      }));
    }

    await product.save();
    res.json(product);
  } catch (error) {
    // Clean up uploaded files if update fails
    if (req.files) {
      req.files.forEach(file => {
        fs.unlink(file.path, err => {
          if (err) console.error('Error deleting file:', err);
        });
      });
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    product.images.forEach(image => {
      const imagePath = path.join(__dirname, image.path);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    });

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cart API with stock validation
app.post('/api/cart/add', async (req, res) => {
  const { userId, productId, quantity = 1 } = req.body;
  
  try {
    // First check product availability
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Not enough stock available' });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [] });
    
    const existingItem = cart.items.find(item => item.productId.toString() === productId);
    const totalQuantity = existingItem ? existingItem.quantity + quantity : quantity;

    if (totalQuantity > product.stock) {
      return res.status(400).json({ error: 'Total quantity exceeds available stock' });
    }
    
    if (existingItem) {
      existingItem.quantity = totalQuantity;
    } else {
      cart.items.push({ productId, quantity });
    }
    
    await cart.save();
    cart = await Cart.findOne({ userId }).populate('items.productId');
    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cart/:userId', async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.params.userId }).populate('items.productId');
    res.json(cart || { userId: req.params.userId, items: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/cart/update', async (req, res) => {
  const { userId, productId, quantity } = req.body;
  
  try {
    let cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });

    if (quantity > 0) {
      // Check stock availability for quantity update
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (quantity > product.stock) {
        return res.status(400).json({ error: 'Requested quantity exceeds available stock' });
      }

      const item = cart.items.find(item => item.productId.toString() === productId);
      if (item) {
        item.quantity = quantity;
      } else {
        cart.items.push({ productId, quantity });
      }
    } else {
      // Remove item if quantity is 0 or negative
      cart.items = cart.items.filter(item => item.productId.toString() !== productId);
    }
    
    await cart.save();
    cart = await Cart.findOne({ userId }).populate('items.productId');
    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/cart/remove', async (req, res) => {
  const { userId, productId } = req.body;
  
  try {
    let cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    
    cart.items = cart.items.filter(item => item.productId.toString() !== productId);
    await cart.save();
    cart = await Cart.findOne({ userId }).populate('items.productId');
    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add checkout endpoint
app.post('/api/checkout', async (req, res) => {
  const { userId } = req.body;
  
  try {
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Validate stock availability for all items
    for (const item of cart.items) {
      const product = item.productId;
      if (product.stock < item.quantity) {
        return res.status(400).json({ 
          error: `Not enough stock for ${product.name}. Available: ${product.stock}`
        });
      }
    }

    // Update product stock
    const updates = cart.items.map(item => {
      return Product.findByIdAndUpdate(
        item.productId._id,
        { $inc: { stock: -item.quantity } },
        { new: true }
      );
    });

    await Promise.all(updates);

    // Clear cart
    cart.items = [];
    await cart.save();

    res.json({ message: 'Checkout successful' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
