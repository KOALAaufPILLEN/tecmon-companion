using System;
using System.IO;
using System.Drawing;
using System.Collections.Generic;
using System.Windows.Forms;
using System.Runtime.InteropServices;

// Runs only as a separate test entry point, never in the installed launcher.
static class CrosshairSelfTest {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window,int index);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr window,int msg,IntPtr w,IntPtr l);
  static void Check(bool ok,string message){if(!ok)throw new Exception(message);}
  static Dictionary<string,object> Look(){return new Dictionary<string,object>{{"size",4},{"gap",0},{"thickness",1},{"alpha",255},{"color",new int[]{167,139,250}},{"outline",true},{"outlineThickness",1},{"dot",true}};}
  static Dictionary<string,object> Options(){return new Dictionary<string,object>{{"target","primary"},{"hotkey","none"},{"scale",1},{"rotation",0},{"shape","cross"},{"dotSize",3}};}
  [STAThread] static int Main(string[] args){
    try{
      string output=args.Length>0?args[0]:".";Directory.CreateDirectory(output);
      var look=Look();var options=Options();
      using(var form=new CrosshairOverlay()){
        var handle=form.Handle;var foreground=GetForegroundWindow();form.Apply(true,look,options);Application.DoEvents();
        Check(form.Visible,"Primary-screen overlay must work without CS2");
        Check(GetForegroundWindow()==foreground,"Overlay stole foreground focus");
        int style=GetWindowLong(handle,-20);Check((style&0x08000020)==0x08000020,"Must be click-through and non-activating");
        var screen=Screen.PrimaryScreen.Bounds;
        Check(form.Left+form.Width/2==screen.Left+screen.Width/2,"Horizontal center incorrect");
        Check(form.Top+form.Height/2==screen.Top+screen.Height/2,"Vertical center incorrect");
        options["offsetX"]=37;options["offsetY"]=-21;form.Apply(true,look,options);
        Check(form.Left+form.Width/2==screen.Left+screen.Width/2+37,"X offset incorrect");
        Check(form.Top+form.Height/2==screen.Top+screen.Height/2-21,"Y offset incorrect");
        foreach(string shape in new[]{"cross","circle"}){
          options["shape"]=shape;options["radius"]=12;options["rotation"]=45;form.Apply(true,look,options);
          using(var image=new Bitmap(512,512,System.Drawing.Imaging.PixelFormat.Format32bppArgb)){
            using(var g=Graphics.FromImage(image))form.Draw(g,1);
            Check(image.GetPixel(0,0).A==0,"Background must remain transparent");
            Check(image.GetPixel(256,256).A>0,"Center dot missing");
            int pixels=0;for(int x=0;x<512;x++)for(int y=0;y<512;y++)if(image.GetPixel(x,y).A>0)pixels++;
            Check(pixels>50&&pixels<10000,"Unexpected glyph bounds");
            image.Save(Path.Combine(output,"crosshair-"+shape+".png"));
          }
        }
        options["target"]="monitor";options["monitor"]=99;form.Apply(true,look,options);Check(!form.Visible,"Missing monitor must hide overlay");
        options["target"]="primary";options["app"]="tecmon-test-no-such-process";form.Apply(true,look,options);Check(!form.Visible,"App filter must hide other apps");
        options.Remove("app");options["hotkey"]="F11";bool registered=false,paused=false;
        form.Runtime=(p,k)=>{paused=p;registered=k;};form.Apply(true,look,options);Check(registered,"Test hotkey was unavailable");
        using(var other=new CrosshairOverlay()){
          var otherHandle=other.Handle;bool second=true;other.Runtime=(p,k)=>second=k;other.Apply(true,look,options);Check(!second,"Hotkey conflict not reported");other.Apply(false,look,options);
        }
        // Dispatch a message to our own test window; never synthesize keyboard/game input.
        SendMessage(handle,0x0312,new IntPtr(0x7C3),IntPtr.Zero);Check(paused&&!form.Visible,"Hotkey pause failed");
        form.Apply(true,look,options);Check(!form.Visible,"Polling reset the pause");
        SendMessage(handle,0x0312,new IntPtr(0x7C3),IntPtr.Zero);Check(!paused&&form.Visible,"Hotkey resume failed");
        form.Apply(false,look,options);Check(!form.Visible,"Disabling did not hide overlay");
      }
      File.WriteAllText(Path.Combine(output,"crosshair-native-test.txt"),"PASS: no CS2, click-through, no focus theft, center, offsets, glyphs, app/monitor filters, hotkey registration/conflict/pause/resume/disposal.");
      return 0;
    }catch(Exception error){Console.Error.WriteLine(error);return 1;}
  }
}
