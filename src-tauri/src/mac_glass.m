#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>
#import <QuartzCore/QuartzCore.h>
#include <stdbool.h>

// Only the controls participate in hit testing. Everything else, including the
// tab strip gestures and the sidebar splitter, goes to the existing web view.
@interface ODControlLayer : NSView
@end
@implementation ODControlLayer
- (BOOL)isFlipped { return YES; }
- (NSView *)hitTest:(NSPoint)point {
    NSView *hit = [super hitTest:point];
    return hit == self ? nil : hit;
}
@end

@interface ODGlass : NSObject
@property(nonatomic, weak) WKWebView *webView;
@property(nonatomic, strong) ODControlLayer *controls;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSView *> *views;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSDictionary *> *models;
@property(nonatomic, strong) NSVisualEffectView *sidebarBackdrop;
@end

@implementation ODGlass
- (void)clicked:(NSControl *)sender {
    NSString *script = [NSString stringWithFormat:
        @"window.dispatchEvent(new CustomEvent('opendoc:mac-control', {detail:%ld}))",
        (long)sender.identifier.integerValue];
    [self.webView evaluateJavaScript:script completionHandler:nil];
    // Keep the existing app-wide shortcuts active after a pointer click.
    [self.webView.window makeFirstResponder:self.webView];
}

- (NSView *)viewForModel:(NSDictionary *)model API_AVAILABLE(macos(26.0)) {
    NSString *kind = model[@"kind"];
    if ([kind isEqualToString:@"sidebar"] || [kind isEqualToString:@"tab"]) {
        NSGlassEffectView *glass = [[NSClassFromString(@"NSGlassEffectView") alloc] initWithFrame:NSZeroRect];
        glass.cornerRadius = [kind isEqualToString:@"sidebar"] ? 24 : 14;
        return glass;
    }

    NSString *identifier = [model[@"id"] stringValue];
    NSString *title = model[@"label"];
    if ([kind isEqualToString:@"switch"]) {
        NSSwitch *toggle = [[NSSwitch alloc] initWithFrame:NSZeroRect];
        toggle.target = self;
        toggle.action = @selector(clicked:);
        toggle.identifier = identifier;
        toggle.state = [model[@"selected"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
        [toggle setAccessibilityLabel:title];
        return toggle;
    }

    NSButton *button = [NSButton buttonWithTitle:title target:self action:@selector(clicked:)];
    NSString *symbol = model[@"symbol"];
    if (symbol.length) {
        button.title = @"";
        button.image = [NSImage imageWithSystemSymbolName:symbol accessibilityDescription:title];
        button.imagePosition = NSImageOnly;
    }
    button.lineBreakMode = NSLineBreakByTruncatingTail;
    button.identifier = identifier;
    button.enabled = ![model[@"disabled"] boolValue];
    button.toolTip = title;
    [button setAccessibilityLabel:title];

    NSGlassEffectView *glass = [[NSClassFromString(@"NSGlassEffectView") alloc] initWithFrame:NSZeroRect];
    glass.cornerRadius = 14;
    // Earlier macOS 26 releases may not expose the interactive setter yet.
    SEL interactive = NSSelectorFromString(@"setEffectIsInteractive:");
    if ([glass respondsToSelector:interactive]) {
        [glass setValue:@YES forKey:@"effectIsInteractive"];
    }
    button.bordered = NO;
    if ([model[@"selected"] boolValue]) {
        glass.tintColor = NSColor.controlAccentColor;
        button.contentTintColor = NSColor.controlTextColor;
    }
    glass.contentView = button;
    return glass;
}

- (void)sync:(NSDictionary *)state API_AVAILABLE(macos(26.0)) {
    WKWebView *webView = self.webView;
    NSView *parent = webView.superview;
    if (!parent) return;

    if (![state[@"enabled"] boolValue]) {
        for (NSView *view in self.views.allValues) [view removeFromSuperview];
        [self.views removeAllObjects];
        [self.models removeAllObjects];
        [self.controls removeFromSuperview];
        self.controls = nil;
        [self.sidebarBackdrop removeFromSuperview];
        self.sidebarBackdrop = nil;
        webView.window.appearance = nil;
        return;
    }

    NSString *appearance = state[@"appearance"];
    webView.window.appearance = [appearance isEqualToString:@"system"] ? nil :
        [NSAppearance appearanceNamed:[appearance isEqualToString:@"dark"] ?
          NSAppearanceNameDarkAqua : NSAppearanceNameAqua];

    if (!self.controls) {
        self.controls = [[ODControlLayer alloc] initWithFrame:webView.frame];
        self.controls.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        [parent addSubview:self.controls positioned:NSWindowAbove relativeTo:webView];
    }
    self.controls.frame = webView.frame;
    NSMutableSet<NSString *> *unused = [NSMutableSet setWithArray:self.views.allKeys];
    BOOL hasSidebar = NO;
    for (NSDictionary *item in state[@"items"]) {
        NSString *key = [item[@"id"] stringValue];
        [unused removeObject:key];
        NSString *kind = item[@"kind"];
        BOOL sidebar = [kind isEqualToString:@"sidebar"];
        BOOL background = sidebar || [kind isEqualToString:@"tab"];
        NSDictionary *model = item[@"model"];
        NSView *view = self.views[key];
        if (!view || ![model isEqual:self.models[key]]) {
            NSView *replacement = [self viewForModel:model];
            if (view) {
                [view.superview replaceSubview:view with:replacement];
            } else if (background) {
                [parent addSubview:replacement positioned:NSWindowBelow relativeTo:webView];
            } else {
                [self.controls addSubview:replacement];
            }
            view = replacement;
            self.views[key] = view;
            self.models[key] = model;
        }

        NSRect rect = NSMakeRect([item[@"x"] doubleValue], [item[@"y"] doubleValue],
                                 [item[@"width"] doubleValue], [item[@"height"] doubleValue]);
        if (background) {
            NSRect localRect = rect;
            if (!webView.isFlipped) {
                localRect.origin.y = NSHeight(webView.bounds) - NSMaxY(rect);
            }
            view.frame = [webView convertRect:localRect toView:parent];
        } else {
            view.frame = rect;
        }
        if (sidebar) {
            hasSidebar = YES;
            if (!self.sidebarBackdrop) {
                self.sidebarBackdrop = [[NSVisualEffectView alloc] initWithFrame:NSZeroRect];
                self.sidebarBackdrop.material = NSVisualEffectMaterialSidebar;
                self.sidebarBackdrop.blendingMode = NSVisualEffectBlendingModeBehindWindow;
                self.sidebarBackdrop.state = NSVisualEffectStateFollowsWindowActiveState;
                self.sidebarBackdrop.wantsLayer = YES;
                self.sidebarBackdrop.layer.cornerRadius = 24;
                self.sidebarBackdrop.layer.masksToBounds = YES;
                [parent addSubview:self.sidebarBackdrop positioned:NSWindowBelow relativeTo:view];
            }
            self.sidebarBackdrop.frame = view.frame;
        }
    }
    self.sidebarBackdrop.hidden = !hasSidebar;
    for (NSString *key in unused) {
        [self.views[key] removeFromSuperview];
        [self.views removeObjectForKey:key];
        [self.models removeObjectForKey:key];
    }
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
        bridge.views = [NSMutableDictionary dictionary];
        bridge.models = [NSMutableDictionary dictionary];
        objc_setAssociatedObject(webView, &association, bridge, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    [bridge sync:state];
}
