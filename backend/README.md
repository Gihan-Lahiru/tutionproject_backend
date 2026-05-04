# Tuition Sir - Backend API

Complete Node.js + Express backend with MVC architecture for the Tuition Sir Learning Management System.

## 🏗️ Project Structure (MVC Pattern)

```
backend/
├── config/
│   └── database.js          # PostgreSQL connection
├── controllers/             # Business logic
│   ├── authController.js
│   ├── classController.js
│   ├── assignmentController.js
│   ├── noteController.js
│   ├── videoController.js
│   ├── paymentController.js
│   └── userController.js
├── models/                  # Data layer
│   ├── User.js
│   ├── Class.js
│   ├── Assignment.js
│   ├── Announcement.js
│   ├── Note.js
│   ├── Video.js
│   └── Payment.js
├── routes/                  # API endpoints
│   ├── auth.js
│   ├── classes.js
│   ├── assignments.js
│   ├── notes.js
│   ├── videos.js
│   ├── payments.js
│   └── users.js
├── middleware/
│   ├── auth.js             # JWT authentication
│   ├── role.js             # Role-based access control
│   └── upload.js           # File upload handling
├── scripts/
│   ├── migrate.js          # Database schema setup
│   └── seed.js             # Sample data
└── server.js               # Main application

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- Database credentials
- JWT secret
- AWS S3 credentials (for file uploads)
- PayHere credentials (for payments)

### 2.1 Email Verification (PHPMailer)
Registration verification emails are sent using PHPMailer through `scripts/send-verification-email.php`.

```bash
# Install PHPMailer for the backend PHP script
composer require phpmailer/phpmailer
```

Set these in `.env`:
- `EMAIL_PROVIDER=phpmailer`
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`
- Optional: `PHP_BINARY` (if `php` command is not in PATH)

### 3. Setup Database
```bash
# Create PostgreSQL database
createdb tuition_sir_db

# Run migrations
npm run migrate

# Seed sample data (optional)
npm run seed
```

### 4. Start Server
```bash
# Development
npm run dev

# Production
npm start
```

Server runs on `http://localhost:5000`

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Classes
- `GET /api/classes` - Get all classes
- `GET /api/classes/:id` - Get class details
- `POST /api/classes` - Create class (Teacher)
- `PUT /api/classes/:id` - Update class (Teacher)
- `DELETE /api/classes/:id` - Delete class (Teacher)
- `POST /api/classes/:id/enroll` - Enroll in class (Student)
- `GET /api/classes/:id/students` - Get enrolled students
- `GET /api/classes/:id/announcements` - Get announcements
- `POST /api/classes/:id/announcements` - Post announcement (Teacher)

### Assignments
- `GET /api/assignments/class/:classId` - Get assignments
- `GET /api/assignments/:id` - Get assignment details
- `POST /api/assignments/class/:classId` - Create assignment (Teacher)
- `PUT /api/assignments/:id` - Update assignment (Teacher)
- `DELETE /api/assignments/:id` - Delete assignment (Teacher)
- `POST /api/assignments/:id/submit` - Submit assignment (Student)
- `POST /api/assignments/:id/grade` - Grade submission (Teacher)
- `GET /api/assignments/:id/submissions` - Get all submissions (Teacher)

### Notes & Videos
- `GET /api/notes/class/:classId` - Get notes
- `POST /api/notes/class/:classId` - Upload note (Teacher)
- `DELETE /api/notes/:id` - Delete note (Teacher)
- `GET /api/videos/class/:classId` - Get videos
- `POST /api/videos/class/:classId` - Add video (Teacher)
- `DELETE /api/videos/:id` - Delete video (Teacher)

### Payments
- `POST /api/payments/init` - Initialize payment
- `POST /api/payments/verify` - Verify payment (Webhook)
- `GET /api/payments/user/:userId` - Get user payments
- `GET /api/payments/stats` - Get payment statistics

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users` - Get all users (Admin)

## 🔐 Authentication

All protected routes require JWT token in header:
```
Authorization: Bearer <token>
```

## 🎭 User Roles

- **Student**: Can enroll in classes, submit assignments, view content
- **Teacher**: Can create classes, post content, grade assignments
- **Admin**: Full access to all features

## 🗄️ Database Schema

See `scripts/migrate.js` for complete schema with:
- Users
- Classes
- Enrollments
- Announcements
- Assignments
- Submissions
- Notes
- Videos
- Payments

## 📦 Default Credentials (After Seeding)

- Admin: `admin@tuitionsir.com` / `admin123`
- Teacher: `teacher@tuitionsir.com` / `teacher123`
- Student: `alice@student.com` / `student123`

## 🛠️ Technologies

- **Node.js** - Runtime
- **Express** - Web framework
- **PostgreSQL** - Database
- **JWT** - Authentication
- **Bcrypt** - Password hashing
- **Multer** - File uploads
- **Helmet** - Security
- **CORS** - Cross-origin requests
