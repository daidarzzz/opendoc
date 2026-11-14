#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>
#import <QuartzCore/QuartzCore.h>
#include <stdbool.h>

// Liquid Glass para la ventana principal (macOS 26+).
//
// La ventana es transparente y el WKWebView no pinta fondo, así que AppKit
// dibuja dos capas por debajo del contenido web:
//   1. `backdrop`: un NSVisualEffectView a ventana completa, para que el
//      escritorio se vea desenfocado y nunca "en crudo" entre superficies.
//   2. `sidebar`: un NSGlassEffectView flotante en el hueco de la barra
//      lateral, con la geometría que envía `useMacGlass`.
// Los controles son HTML/CSS: nada nativo intercepta clics.

static const CGFloat kSidebarRadius = 18;

@interface ODGlass : NSObject
@property(nonatomic, weak) WKWebView *webView;
@property(nonatomic, strong) NSVisualEffectView *backdrop;
@property(nonatomic, strong) NSView *sidebar;
@property(nonatomic) BOOL enabled;
@property(nonatomic) BOOL observing;
@end

@implementation ODGlass

// Una barra de herramientas unificada y vacía hace que macOS 26 dibuje la
// ventana con el radio grande de las apps con barra lateral (como el
// Finder) y centre los semáforos en una franja de 52 pt, alineados con las
// pestañas. Así el panel lateral (radio 18 pt a 8 pt del borde) queda
// concéntrico con la esquina de la ventana.
- (BOOL)isFullScreen {
    return (self.webView.window.styleMask & NSWindowStyleMaskFullScreen) != 0;
}

// En pantalla completa la barra vacía se volvería una franja opaca que
// empuja el contenido y tapa las pestañas: se quita al entrar y vuelve al
// salir (la web detecta la pantalla completa por su cuenta, `design.ts`).
- (void)observeFullScreen {
    if (self.observing || !self.webView.window) return;
    self.observing = YES;
    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    NSWindow *window = self.webView.window;
    __weak ODGlass *weakSelf = self;
    [center addObserverForName:NSWindowWillEnterFullScreenNotification object:window queue:nil
                    usingBlock:^(NSNotification *note) { [weakSelf fullScreenChanged:YES]; }];
    [center addObserverForName:NSWindowDidExitFullScreenNotification object:window queue:nil
                    usingBlock:^(NSNotification *note) { [weakSelf fullScreenChanged:NO]; }];
}

- (void)fullScreenChanged:(BOOL)fullScreen {
    if (self.enabled) [self applyToolbar:!fullScreen];
}

- (void)applyToolbar:(BOOL)enabled {
    NSWindow *window = self.webView.window;
    if (!window) return;
    if (enabled && [self isFullScreen]) enabled = NO;
    if (enabled && !window.toolbar) {
        NSToolbar *toolbar = [[NSToolbar alloc] initWithIdentifier:@"com.opendoc.glass"];
        toolbar.displayMode = NSToolbarDisplayModeIconOnly;
        toolbar.allowsUserCustomization = NO;
        window.toolbar = toolbar;
        window.toolbarStyle = NSWindowToolbarStyleUnified;
        window.titlebarSeparatorStyle = NSTitlebarSeparatorStyleNone;
    } else if (!enabled && [window.toolbar.identifier isEqualToString:@"com.opendoc.glass"]) {
        window.toolbar = nil;
        window.titlebarSeparatorStyle = NSTitlebarSeparatorStyleAutomatic;
    }
}

- (void)teardown {
    self.enabled = NO;
    [self applyToolbar:NO];
    [self.sidebar removeFromSuperview];
    self.sidebar = nil;
    [self.backdrop removeFromSuperview];
    self.backdrop = nil;
    self.webView.window.appearance = nil;
}

- (void)ensureBackdropIn:(NSView *)parent {
    if (self.backdrop) return;
    NSVisualEffectView *backdrop = [[NSVisualEffectView alloc] initWithFrame:parent.bounds];
    backdrop.material = NSVisualEffectMaterialUnderWindowBackground;
    backdrop.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    backdrop.state = NSVisualEffectStateFollowsWindowActiveState;
    backdrop.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [parent addSubview:backdrop positioned:NSWindowBelow relativeTo:nil];
    self.backdrop = backdrop;
}

- (void)ensureSidebarIn:(NSView *)parent API_AVAILABLE(macos(26.0)) {
    if (self.sidebar) return;
    NSGlassEffectView *glass = [[NSClassFromString(@"NSGlassEffectView") alloc] initWithFrame:NSZeroRect];
    glass.cornerRadius = kSidebarRadius;
    [parent addSubview:glass positioned:NSWindowAbove relativeTo:self.backdrop];
    self.sidebar = glass;
}

- (void)sync:(NSDictionary *)state API_AVAILABLE(macos(26.0)) {
    WKWebView *webView = self.webView;
    NSView *parent = webView.superview;
    if (!parent) return;

    if (![state[@"enabled"] boolValue]) {
        [self teardown];
        return;
    }

    NSString *appearance = state[@"appearance"];
    webView.window.appearance = [appearance isEqualToString:@"system"] ? nil :
        [NSAppearance appearanceNamed:[appearance isEqualToString:@"dark"] ?
          NSAppearanceNameDarkAqua : NSAppearanceNameAqua];

    self.enabled = YES;
    [self observeFullScreen];
    [self ensureBackdropIn:parent];
    [self applyToolbar:YES];

    NSDictionary *sidebarItem = nil;
    for (NSDictionary *item in state[@"items"]) {
        if ([item[@"kind"] isEqualToString:@"sidebar"]) sidebarItem = item;
    }
    if (!sidebarItem) {
        self.sidebar.hidden = YES;
        return;
    }

    [self ensureSidebarIn:parent];
    NSRect rect = NSMakeRect([sidebarItem[@"x"] doubleValue], [sidebarItem[@"y"] doubleValue],
                             [sidebarItem[@"width"] doubleValue], [sidebarItem[@"height"] doubleValue]);
    if (!webView.isFlipped) {
        rect.origin.y = NSHeight(webView.bounds) - NSMaxY(rect);
    }
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    self.sidebar.frame = [webView convertRect:rect toView:parent];
    self.sidebar.hidden = NO;
    [CATransaction commit];
}
@end

bool opendoc_glass_available(void) {
    return NSClassFromString(@"NSGlassEffectView") != Nil;
}

void opendoc_glass_sync(void *handle, const char *json, size_t length) {
    if (!opendoc_glass_available()) return;
    static char association;
    WKWebView *webView = (__bridge WKWebView *)handle;
    NSData *data = [NSData dataWithBytes:json length:length];
    NSDictionary *state = [NSJSONSerialization JSONObjectWithData:data options:0 error:NULL];
    if (!state || !webView) return;
    ODGlass *bridge = objc_getAssociatedObject(webView, &association);
    if (!bridge) {
        bridge = [ODGlass new];
        bridge.webView = webView;
        objc_setAssociatedObject(webView, &association, bridge, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    if (@available(macOS 26.0, *)) {
        [bridge sync:state];
    }
}
