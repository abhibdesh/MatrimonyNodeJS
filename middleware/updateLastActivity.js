import UserBase from '../models/UserBase.js'; 

const updateLastActivity = async (req, res, next) => {
  try {
    const userId = req.user._id; 
    if (userId) {
      await UserBase.findByIdAndUpdate(userId, {
        lastActivity: new Date(),
      });
    }
    next();
  } catch (err) {
    console.error('Failed to update lastActivity:', err.message);
    next();
  }
};

export default updateLastActivity;
