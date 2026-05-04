const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const roleMiddleware = require('../middleware/role');
const { uploadPaper, cloudinary } = require('../middleware/cloudinaryUpload');
const multer = require('multer');
const Paper = require('../models/Paper');
const User = require('../models/User');
const { addWatermarkToPdf } = require('../utils/pdfWatermark');
const https = require('https');
const { notifyStudentsByGrade, notifyStudentsByClass } = require('../utils/notificationService');

// Configure multer for handling multiple files
const upload = multer();

// All routes require authentication
router.use(authMiddleware);

// Download paper with watermark (students)
router.get('/:id/download', roleMiddleware('student'), async (req, res) => {
  try {
    const paperId = req.params.id;
    const paper = await Paper.findById(paperId);
    
    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    const student = await User.findById(req.user.id);
    const studentInfo = {
      name: student?.name,
      grade: student?.grade,
    };

    // Add watermark and send
    const watermarkedPdf = await addWatermarkToPdf(paper.file_url, studentInfo);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${paper.title}.pdf"`);
    res.send(watermarkedPdf);
  } catch (error) {
    console.error('Download watermarked paper error:', error);
    console.error('Error details:', error?.message);
    console.error('Paper URL:', paper?.file_url);

    const msg = String(error?.message || '')
    const looksLikeNotPdf =
      msg.toLowerCase().includes('pdf') ||
      msg.toLowerCase().includes('no pdf') ||
      msg.toLowerCase().includes('invalid')

    if (looksLikeNotPdf || msg.toLowerCase().includes('failed to download file')) {
      return res.status(400).json({ message: 'This file cannot be watermarked (not a valid PDF).' })
    }

    res.status(500).json({ message: 'Failed to download paper.' });
  }
});

// Upload paper/note/assignment (Teacher only)
router.post('/upload', roleMiddleware('teacher'), upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { title, grade, type, topic, class_id } = req.body;
    const file = req.files.file[0];
    const thumbnail = req.files.thumbnail ? req.files.thumbnail[0] : null;

    if (!title || !grade || !type) {
      return res.status(400).json({ message: 'Title, grade, and type are required' });
    }

    const normalizedTopic = String(topic || '').trim();
    const displayTitle = normalizedTopic || String(title || '').trim();

    // Check file size (Cloudinary free plan limit is 10MB for raw files)
    const maxFileSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxFileSize) {
      return res.status(400).json({ 
        message: `File size too large. Maximum size is 10MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB` 
      });
    }

    // Upload main file to Cloudinary
    const fileUploadPromise = new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'tuition-app/papers', resource_type: 'raw' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(file.buffer);
    });

    // Upload thumbnail if provided
    let thumbnailResult = null;
    if (thumbnail) {
      const thumbnailUploadPromise = new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'tuition-app/thumbnails', transformation: { width: 400, height: 300, crop: 'fill' } },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(thumbnail.buffer);
      });
      thumbnailResult = await thumbnailUploadPromise;
    }

    const fileResult = await fileUploadPromise;

    // Create paper record in database
    const paper = await Paper.create({
      title: displayTitle,
      grade,
      type,
      topic: normalizedTopic || null,
      class_id: class_id || null,
      file_url: fileResult.secure_url,
      file_public_id: fileResult.public_id,
      thumbnail_url: thumbnailResult ? thumbnailResult.secure_url : null,
      thumbnail_public_id: thumbnailResult ? thumbnailResult.public_id : null,
      uploaded_by: req.user.id
    });

    // Notifications for students in this grade
    try {
      const normalizedType = String(type || '').toLowerCase();
      const materialName = displayTitle || 'New material';
      const message =
        normalizedType === 'note'
          ? `New Note: ${materialName}`
          : normalizedType === 'paper' || normalizedType === 'past paper'
            ? `New Past Paper: ${materialName}`
            : normalizedType === 'assignment'
              ? `New Assignment: ${materialName}`
              : `New Material: ${materialName}`;

      const notifType =
        normalizedType === 'note'
          ? 'note'
          : normalizedType === 'assignment'
            ? 'assignment'
            : 'paper';

      if (class_id) {
        await notifyStudentsByClass({ classId: class_id, type: notifType, message });
      } else {
        await notifyStudentsByGrade({ grade, type: notifType, message });
      }
    } catch (notifyErr) {
      console.error('Failed to create upload notifications:', notifyErr);
    }

    res.status(201).json({
      message: 'Paper uploaded successfully',
      paper
    });
  } catch (error) {
    console.error('Upload paper error:', error);
    
    // Provide specific error message for Cloudinary errors
    if (error.message && error.message.includes('File size too large')) {
      return res.status(400).json({ 
        message: 'File size exceeds Cloudinary limit. Please upload files smaller than 10MB.' 
      });
    }
    
    // Clean up uploaded file if database insert fails
    if (req.file && req.file.filename) {
      await cloudinary.uploader.destroy(req.file.filename, { resource_type: 'raw' }).catch(err => {
        console.error('Error deleting file from Cloudinary:', err);
      });
    }
    res.status(500).json({ message: error.message || 'Failed to upload paper' });
  }
});

// Get all papers
router.get('/', async (req, res) => {
  try {
    const { grade, type, classId } = req.query;
    
    let papers;
    if (classId) {
      papers = await Paper.getByClassId(classId);
    } else if (grade) {
      papers = await Paper.getByGrade(grade);
    } else if (type) {
      papers = await Paper.getByType(type);
    } else {
      papers = await Paper.getAll();
    }

    res.json({ papers });
  } catch (error) {
    console.error('Get papers error:', error);
    res.status(500).json({ message: 'Failed to fetch papers' });
  }
});

// Get single paper
router.get('/:id', async (req, res) => {
  try {
    const paper = await Paper.getById(req.params.id);
    
    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    res.json({ paper });
  } catch (error) {
    console.error('Get paper error:', error);
    res.status(500).json({ message: 'Failed to fetch paper' });
  }
});

// Increment download count
router.post('/:id/download', async (req, res) => {
  try {
    const paper = await Paper.incrementDownloads(req.params.id);
    
    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    res.json({ 
      message: 'Download count updated',
      downloads: paper.downloads 
    });
  } catch (error) {
    console.error('Increment downloads error:', error);
    res.status(500).json({ message: 'Failed to update download count' });
  }
});

// Proxy download route - serves file with proper headers
router.get('/:id/file', async (req, res) => {
  try {
    const paper = await Paper.getById(req.params.id);
    
    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    // Extract file extension from Cloudinary URL
    const urlParts = paper.file_url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const fileExt = fileName.includes('.') ? fileName.split('.').pop().split('?')[0] : 'pdf';
    
    // Create a safe filename with proper extension
    let safeTitle = paper.title.replace(/[^a-zA-Z0-9._-\s]/g, '_').replace(/\s+/g, '_');
    // Remove any existing extension from title
    safeTitle = safeTitle.replace(/\.(pdf|docx?|xlsx?|pptx?|txt|png|jpe?g)$/i, '');
    const downloadName = `${safeTitle}.${fileExt}`;
    
    // Determine proper MIME type
    const mimeTypes = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg'
    };
    const contentType = mimeTypes[fileExt.toLowerCase()] || 'application/octet-stream';
    
    // Set proper headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', contentType);
    
    // Fetch file from Cloudinary and pipe to response
    https.get(paper.file_url, (cloudinaryRes) => {
      cloudinaryRes.pipe(res);
    }).on('error', (error) => {
      console.error('Error fetching file from Cloudinary:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to download file' });
      }
    });
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ message: 'Failed to download file' });
  }
});

// Delete paper (Teacher only)
router.delete('/:id', roleMiddleware('teacher'), async (req, res) => {
  try {
    const paper = await Paper.getById(req.params.id);
    
    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    // Delete file from Cloudinary
    await cloudinary.uploader.destroy(paper.file_public_id, { resource_type: 'raw' });
    
    // Delete thumbnail if exists
    if (paper.thumbnail_public_id) {
      await cloudinary.uploader.destroy(paper.thumbnail_public_id);
    }

    // Delete from database
    await Paper.delete(req.params.id);

    res.json({ message: 'Paper deleted successfully' });
  } catch (error) {
    console.error('Delete paper error:', error);
    res.status(500).json({ message: 'Failed to delete paper' });
  }
});

// Update paper (Teacher only)
router.put('/:id', roleMiddleware('teacher'), upload.fields([{ name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
  try {
    const paper = await Paper.getById(req.params.id);
    
    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    const { title, topic } = req.body;
    const thumbnail = req.files && req.files.thumbnail ? req.files.thumbnail[0] : null;

    let thumbnailResult = null;
    
    // Upload new thumbnail if provided
    if (thumbnail) {
      // Delete old thumbnail if exists
      if (paper.thumbnail_public_id) {
        await cloudinary.uploader.destroy(paper.thumbnail_public_id).catch(err => {
          console.error('Error deleting old thumbnail:', err);
        });
      }
      
      // Upload new thumbnail
      const thumbnailUploadPromise = new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'tuition-app/thumbnails', transformation: { width: 400, height: 300, crop: 'fill' } },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(thumbnail.buffer);
      });
      thumbnailResult = await thumbnailUploadPromise;
    }

    // Update paper in database
    const updatedPaper = await Paper.update(req.params.id, {
      title: title || paper.title,
      topic: topic || paper.topic,
      thumbnail_url: thumbnailResult ? thumbnailResult.secure_url : paper.thumbnail_url,
      thumbnail_public_id: thumbnailResult ? thumbnailResult.public_id : paper.thumbnail_public_id
    });

    res.json({
      message: 'Paper updated successfully',
      paper: updatedPaper
    });
  } catch (error) {
    console.error('Update paper error:', error);
    res.status(500).json({ message: 'Failed to update paper' });
  }
});

module.exports = router;
