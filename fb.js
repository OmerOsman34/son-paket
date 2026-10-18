/* Son Paket: Firebase bağlantısı (giriş + Firestore Lite).
   Uygulama bu dosyayı window.FB_READY üzerinden kullanır. */
const V='10.12.2';
const BASE='https://www.gstatic.com/firebasejs/'+V+'/';

async function load(){
  const [A,U,F]=await Promise.all([
    import(BASE+'firebase-app.js'),
    import(BASE+'firebase-auth.js'),
    import(BASE+'firebase-firestore-lite.js')
  ]);
  const app=A.initializeApp(window.FB_CONFIG);
  const auth=U.initializeAuth(app,{persistence:[U.indexedDBLocalPersistence,U.browserLocalPersistence]});
  auth.languageCode='tr';
  const db=F.getFirestore(app);
  const ref=uid=>F.doc(db,'kullanicilar',uid);
  const plain=u=>u?{uid:u.uid,email:u.email||''}:null;
  const noUser=()=>{const e=new Error('no user');e.code='auth/no-current-user';return e;};
  async function reauth(pw){
    const u=auth.currentUser;if(!u)throw noUser();
    await U.reauthenticateWithCredential(u,U.EmailAuthProvider.credential(u.email,pw));
    return u;
  }
  return {
    onAuth(cb){return U.onAuthStateChanged(auth,u=>cb(plain(u)));},
    current(){return plain(auth.currentUser);},
    async signIn(email,pw){const c=await U.signInWithEmailAndPassword(auth,email,pw);return plain(c.user);},
    async signUp(email,pw){const c=await U.createUserWithEmailAndPassword(auth,email,pw);return plain(c.user);},
    signOut(){return U.signOut(auth);},
    async resetPassword(email,url){
      try{await U.sendPasswordResetEmail(auth,email,url?{url}:undefined);}
      catch(e){
        if(url&&e&&/continue-uri|unauthorized-domain/.test(e.code||''))await U.sendPasswordResetEmail(auth,email);
        else throw e;
      }
    },
    async changePassword(oldPw,newPw){const u=await reauth(oldPw);await U.updatePassword(u,newPw);},
    async deleteAccount(pw){const u=await reauth(pw);await F.deleteDoc(ref(u.uid));await U.deleteUser(u);},
    async loadDoc(uid){const s=await F.getDoc(ref(uid));return s.exists()?s.data():null;},
    async saveMerged(uid,fn){
      return F.runTransaction(db,async tx=>{
        const s=await tx.get(ref(uid));
        const out=fn(s.exists()?s.data():null);
        if(out)tx.set(ref(uid),out);
        return out;
      });
    }
  };
}
load().then(api=>{window.__fbRes(api);},err=>{console.warn('Firebase yüklenemedi',err);window.__fbRes(null);});
