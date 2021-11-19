const crypto = require('crypto');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');

exports.register = async (req, res, next) => {
  const { username, email, password } = req.body;

  try {
    const user = await User.create({
      username,
      email,
      password,
      verified: false,
    });

    const verifyToken = user.getVerifyToken();
    await user.save();

    const verifyUrl = `http://localhost:3000/verify/${verifyToken}`;
    const message = `
      <h1>Please verify your Email!</h1>
      <p>Click <a clicktracking=off href=${verifyUrl}>Here</a> to Verify your Email</p>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Ava Email Verification',
        html: message,
      });

      res.status(200).json({
        success: true,
        data: 'Registered Successfully - Check your Emails',
      });
    } catch (error) {
      next(error);
    }
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password)
    return next(new ErrorResponse('Provide Credentials', 400));

  try {
    const user = await User.findOne({ email }).select('+password');

    if (!user) return next(new ErrorResponse('Invalid Credentials', 401));
    if (!user.verified) return next(new ErrorResponse('Verify Email', 401));

    const passwordMatch = await user.comparePasswords(password);

    if (!passwordMatch)
      return next(new ErrorResponse('Invalid Credentials', 401));

    sendUserAuth(user, 200, res);
  } catch (error) {
    next(error);
  }
};

exports.verify = async (req, res, next) => {
  const verifiedToken = crypto
    .createHash('sha256')
    .update(req.params.verifiedToken)
    .digest('hex');

  try {
    const user = await User.findOne({ verifiedToken });

    if (!user) return next(new ErrorResponse('Couldnt Verify User', 400));

    user.verified = true;
    user.verifiedToken = undefined;

    await user.save();

    return res.status(201).json({ success: true, data: 'User verified' });
  } catch (error) {
    next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return next(new ErrorResponse('Email couldnt be sent', 404));
    const resetToken = user.getResetPasswordToken();
    await user.save();

    const resetUrl = `http://localhost:3000/resetPassword/${resetToken}`;
    const message = `
      <h1>You´ve requested a new Password</h1>
      <p>Click <a clicktracking=off href=${resetUrl}>Here</a> to Reset the Password</p>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Ava Password Reset',
        html: message,
      });

      res.status(200).json({ success: true, data: 'Email sent' });
    } catch (error) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save();

      return next(new ErrorResponse('Email couldnt be send'), 500);
    }
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resetToken)
    .digest('hex');

  try {
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) return next(new ErrorResponse('Invalid Reset Token'), 400);

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    return res
      .status(201)
      .json({ success: true, data: 'Password Reset Success' });
  } catch (error) {
    next(error);
  }
};

exports.refreshJwtToken = async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) return next(new ErrorResponse('Provide Credentials', 400));

  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decoded.id);
    if (!user)
      return next(new ErrorResponse('Couldnt update Access Token', 404));

    sendUserAuth(user, 200, res);
  } catch (error) {
    next(error);
  }
};

const sendUserAuth = (user, statusCode, res) => {
  const accessToken = user.getSignedJwtAccessToken();
  const refreshToken = user.getSignedJwtRefreshToken();
  res.status(statusCode).json({
    success: true,
    accessToken,
    refreshToken,
    user: { id: user._id, username: user.username, email: user.email },
  });
};
