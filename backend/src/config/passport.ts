import passport from 'passport';

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  done(null, null);
});

export default passport;
