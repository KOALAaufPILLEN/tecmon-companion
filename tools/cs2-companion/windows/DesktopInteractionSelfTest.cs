using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using System.Runtime.InteropServices;

// Synthetic windows only; never synthesize keys or touch a running game.
class DesktopInteractionSelfTest {
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr window,int msg,IntPtr w,IntPtr l);
  static void Check(bool ok,string why){if(!ok)throw new Exception(why);}
  static void Set(object value,string key,object next){value.GetType().GetField(key,BindingFlags.Instance|BindingFlags.NonPublic).SetValue(value,next);}
  static object Get(object value,string key){return value.GetType().GetField(key,BindingFlags.Instance|BindingFlags.NonPublic).GetValue(value);}
  static object Call(object value,string method){return value.GetType().GetMethod(method,BindingFlags.Instance|BindingFlags.NonPublic).Invoke(value,null);}
  [STAThread] static int Main(string[] args){try{
    uint code,flags;
    Check(DesktopPet.MenuShortcut("F8","none",out code,out flags)&&code==(uint)Keys.F8&&flags==0x4000,"Single key mapping");
    Check(DesktopPet.MenuShortcut("M","Control",out code,out flags)&&code==(uint)Keys.M&&flags==0x4002,"Two-key mapping");
    Check(DesktopPet.MenuShortcut("3","Alt",out code,out flags)&&code==51&&flags==0x4001,"Digit mapping");
    Check(!DesktopPet.MenuShortcut("A+B","Control",out code,out flags)&&!DesktopPet.MenuShortcut("F8","Control+Alt",out code,out flags),"Unknown combinations accepted");
    using(var pet=new DesktopPet(true))using(var other=new DesktopPet(true)){
      var handle=pet.Handle;var second=other.Handle;bool found=false;
      foreach(string key in new[]{"F6","F7","F8","F10","F11"}){
        Set(pet,"menuKey",key);Set(pet,"menuModifier","Shift");Set(pet,"preview",false);Call(pet,"UpdateMenuHotkey");Set(pet,"preview",true);
        if((bool)Get(pet,"menuHotkeyRegistered")){found=true;break;}
      }
      Check(found,"No test hotkey available");
      Set(other,"menuKey",Get(pet,"menuKey"));Set(other,"menuModifier","Shift");Set(other,"preview",false);Call(other,"UpdateMenuHotkey");Set(other,"preview",true);
      Check(!(bool)Get(other,"menuHotkeyRegistered"),"Conflicting key was accepted");
      SendMessage(handle,0x0312,new IntPtr(0x7C4),IntPtr.Zero);Application.DoEvents();var initial=pet.Location;
      var panel=(DesktopPanel)Get(pet,"panel");Check(panel!=null&&panel.Visible&&!panel.ShowInTaskbar,"Popup did not open");
      panel.Location=new Point(panel.Left+10,panel.Top+10);Check(pet.Location==initial,"Moving popup moved the figure");
      SendMessage(handle,0x0312,new IntPtr(0x7C4),IntPtr.Zero);Check(!panel.Visible,"Second menu press did not close popup");
      var anchor=(Rectangle)typeof(DesktopPet).GetMethod("TipAnchor",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(pet,null);Check(anchor==pet.Bounds,"Default bubble detached from visible figure");
    }
    using(var parent=new TipBubble()){
      parent.Mirror=new TipBubble();parent.MirrorAnchor=()=>new Rectangle(200,200,144,164);
      parent.Present("TecMon Chat","Synthetischer Test",new Rectangle(600,400,144,164),null,-5,false,true);Application.DoEvents();
      Check(parent.Visible&&parent.Mirror.Visible,"Second-screen copy missing");
      Check(!((Timer)Get(parent,"hide")).Enabled,"Sticky chat still has an expiry timer");
      parent.MirrorAnchor=()=>null;parent.Relayout(new Rectangle(600,400,144,164));Check(!parent.Mirror.Visible&&parent.Visible,"Mirror preference/focus change hid primary chat");
      parent.MirrorAnchor=()=>new Rectangle(200,200,144,164);parent.Relayout(new Rectangle(600,400,144,164));Check(parent.Mirror.Visible,"Existing chat did not return after game focus/monitor change");
      parent.Quiet();Check(!parent.Visible&&!parent.Mirror.Visible,"Quiet did not hide both bubbles");
    }
    if(args.Length>0)File.WriteAllText(args[0],"PASS: one/two-key mapping, actual RegisterHotKey conflict, popup open/close by own WM_HOTKEY, detached popup, pet anchor, mirrored bubble, sticky chat, quiet/disposal. No game input.");
    return 0;
  }catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}
