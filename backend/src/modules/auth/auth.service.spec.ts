import { createClient } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { AuthGuard } from '../../common/guards/auth.guard';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
describe('Live authentication', () => {
  const user = { id: 'auth-id', email: 'student@example.com', role: 'student' };
  let db: any;
  let auth: any;
  let service: AuthService;
  beforeEach(() => {
    db = { isDemo: false, getProfile: jest.fn().mockResolvedValue(user), createProfile: jest.fn(), client: { auth: { getUser: jest.fn() } } };
    auth = { auth: { signInWithPassword: jest.fn(), signUp: jest.fn(), signOut: jest.fn().mockResolvedValue({}), refreshSession: jest.fn() } };
    (createClient as jest.Mock).mockReturnValue(auth);
    service = new AuthService(db);
  });
  it('verifies the password through Supabase and returns a refreshable session', async () => {
    auth.auth.signInWithPassword.mockResolvedValue({ data: { user, session: { access_token: 'jwt', refresh_token: 'refresh' } } });
    expect(await service.login({ email: 'student@example.com', password: 'secret-password' })).toMatchObject({ token: 'jwt', refresh_token: 'refresh', profile: user });
    expect(auth.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'student@example.com', password: 'secret-password' });
    expect(db.createProfile).not.toHaveBeenCalled();
  });
  it('rejects a selected role mismatch and revokes the temporary session', async () => {
    auth.auth.signInWithPassword.mockResolvedValue({data:{user,session:{access_token:'jwt'}}});
    await expect(service.login({email:user.email,password:'secret-password',role:'teacher'})).rejects.toThrow('selected account type');
    expect(auth.auth.signOut).toHaveBeenCalledWith({scope:'local'});
    expect(db.createProfile).not.toHaveBeenCalled();
  });
  it('accepts a matching selected role', async () => {
    auth.auth.signInWithPassword.mockResolvedValue({data:{user,session:{access_token:'jwt'}}});
    expect(await service.login({email:user.email,password:'secret-password',role:'student'})).toMatchObject({profile:user});
    expect(auth.auth.signOut).not.toHaveBeenCalled();
  });
  it('rejects invalid passwords and missing passwords', async () => {
    auth.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'bad password' } });
    await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toThrow('Invalid email or password');
    await expect(service.login({ email: user.email })).rejects.toThrow('required');
  });
  it('does not allow public teacher registration', async () => {
    await expect(service.register({ email: user.email, full_name: 'Student', role: 'teacher', password: 'strong-password' })).rejects.toThrow('administrator');
    expect(auth.auth.signUp).not.toHaveBeenCalled();
  });
  it('reports confirmation requirement without issuing a session', async () => {
    auth.auth.signUp.mockResolvedValue({ data: { user, session: null } });
    expect(await service.register({ email: user.email, full_name: 'Student', role: 'student', password: 'strong-password' })).toEqual({confirmation_required: true});
    expect(db.getProfile).not.toHaveBeenCalled();
  });
  it('uses the configured frontend callback without taking a redirect from the user', async () => {
    const previous = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://quizna.example';
    try {
      auth.auth.signUp.mockResolvedValue({data:{user,session:null}});
      await service.register({email:user.email,full_name:'Student',role:'student',password:'strong-password'});
      expect(auth.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({options:{data:{full_name:'Student'},emailRedirectTo:'https://quizna.example/auth/confirm'}}));
    } finally {
      if (previous === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previous;
    }
  });
  it('refreshes through an isolated Supabase client', async () => {
    auth.auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'new', refresh_token: 'rotated' } } });
    expect(await service.refresh('old')).toEqual({ token: 'new', refresh_token: 'rotated' });
  });
  it('never accepts demo tokens or user-id headers as live authentication', async () => {
    const guard = new AuthGuard(db);
    db.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    const request = { headers: { authorization: 'Bearer teacher-token', 'x-user-id': 'auth-id' } };
    await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as any)).rejects.toThrow('expired');
    expect(db.client.auth.getUser).toHaveBeenCalledWith('teacher-token');
  });
  it('requires a real local session instead of accepting a fixed demo token in XAMPP mode', async () => {
    const localDb:any={isDemo:true,isMysql:true,localAuth:{authenticate:jest.fn().mockResolvedValue(undefined),login:jest.fn().mockRejectedValue(new Error('Invalid email or password'))},getProfile:jest.fn()};
    const request={headers:{authorization:'Bearer teacher-token'}};
    await expect(new AuthGuard(localDb).canActivate({switchToHttp:()=>({getRequest:()=>request})} as any)).rejects.toThrow('Invalid credentials');
    expect(localDb.getProfile).not.toHaveBeenCalled();
    const localService=new AuthService(localDb);
    expect(localService.options().demoLogin).toBe(false);
    await expect(localService.login({email:'teacher@quizna.dev'})).rejects.toThrow('Invalid email or password');
    expect(localDb.localAuth.login).toHaveBeenCalled();
  });

});
