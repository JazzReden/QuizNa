import { LocalAuthService } from './local-auth.service';
import { LocalPassword } from './local-password';
describe('Local account type selection',()=>{
  let store:any; let service:LocalAuthService;
  beforeEach(()=>{
    store={transaction:jest.fn(fn=>fn()),authCredential:jest.fn().mockResolvedValue({passwordHash:'hash',profile:{id:'student-id',role:'student'}}),saveAuthSession:jest.fn()};
    jest.spyOn(LocalPassword,'verify').mockResolvedValue(true);
    service=new LocalAuthService(store);
  });
  afterEach(()=>jest.restoreAllMocks());
  it('does not issue a session or change permissions on mismatch',async()=>{
    await expect(service.login({email:'student@test.dev',password:'valid-password',role:'teacher'})).rejects.toThrow('selected account type');
    expect(store.saveAuthSession).not.toHaveBeenCalled();
  });
  it('issues a session for the matching role',async()=>{
    expect(await service.login({email:'student@test.dev',password:'valid-password',role:'student'})).toMatchObject({profile:{role:'student'}});
    expect(store.saveAuthSession).toHaveBeenCalledTimes(1);
  });
  it('checks passwords before revealing account type mismatch',async()=>{
    (LocalPassword.verify as jest.Mock).mockResolvedValue(false);
    await expect(service.login({email:'student@test.dev',password:'wrong',role:'teacher'})).rejects.toThrow('Invalid email or password');
    expect(store.saveAuthSession).not.toHaveBeenCalled();
  });
});
