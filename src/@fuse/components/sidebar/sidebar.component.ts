import { Component, ElementRef, HostBinding, HostListener, Input, OnDestroy, OnInit, Renderer2, ViewEncapsulation } from '@angular/core';
import { animate, AnimationBuilder, AnimationPlayer, style } from '@angular/animations';
import { ObservableMedia } from '@angular/flex-layout';
import { Subject } from 'rxjs';

import { FuseSidebarService } from './sidebar.service';
import { FuseMatchMediaService } from '@fuse/services/match-media.service';
import { FuseConfigService } from '@fuse/services/config.service';
import { takeUntil } from 'rxjs/internal/operators';

@Component({
    selector     : 'fuse-sidebar',
    templateUrl  : './sidebar.component.html',
    styleUrls    : ['./sidebar.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class FuseSidebarComponent implements OnInit, OnDestroy
{
    // Name
    @Input()
    name: string;

    // Position
    @Input()
    position: 'left' | 'right';

    // Open
    @HostBinding('class.open')
    opened: boolean;

    // Locked Open
    @Input()
    lockedOpen: string;

    // isLockedOpen
    @HostBinding('class.locked-open')
    isLockedOpen: boolean;

    // Folded unfolded
    @HostBinding('class.unfolded')
    unfolded: boolean;

    // Invisible overlay
    @Input()
    invisibleOverlay: boolean;

    // Private
    private _folded: boolean;
    private _fuseConfig: any;
    private _wasActive: boolean;
    private _backdrop: HTMLElement | null = null;
    private _player: AnimationPlayer;
    private _unsubscribeAll: Subject<any>;

    /**
     * Constructor
     *
     * @param {AnimationBuilder} _animationBuilder
     * @param {ElementRef} _elementRef
     * @param {FuseConfigService} _fuseConfigService
     * @param {FuseMatchMediaService} _fuseMatchMediaService
     * @param {FuseSidebarService} _fuseSidebarService
     * @param {ObservableMedia} _observableMedia
     * @param {Renderer2} _renderer
     */
    constructor(
        private _animationBuilder: AnimationBuilder,
        private _elementRef: ElementRef,
        private _fuseConfigService: FuseConfigService,
        private _fuseMatchMediaService: FuseMatchMediaService,
        private _fuseSidebarService: FuseSidebarService,
        private _observableMedia: ObservableMedia,
        private _renderer: Renderer2
    )
    {
        // Set the defaults
        this.folded = false;
        this.opened = false;
        this.position = 'left';
        this.invisibleOverlay = false;

        // Set the private defaults
        this._unsubscribeAll = new Subject();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    // Folded
    @HostBinding('class.folded')
    @Input()
    set folded(value: boolean)
    {
        // Only work if the sidebar is not closed
        if ( !this.opened )
        {
            return;
        }

        // Set the folded
        this._folded = value;

        // Programmatically add/remove margin to the element
        // that comes after or before based on the position
        let sibling,
            styleRule;

        const styleValue = '64px';

        // Get the sibling and set the style rule
        if ( this.position === 'left' )
        {
            sibling = this._elementRef.nativeElement.nextElementSibling;
            styleRule = 'marginLeft';
        }
        else
        {
            sibling = this._elementRef.nativeElement.previousElementSibling;
            styleRule = 'marginRight';
        }

        // If there is no sibling, return...
        if ( !sibling )
        {
            return;
        }

        // If folded...
        if ( value )
        {
            // Set the style
            this._renderer.setStyle(sibling, styleRule, styleValue);
        }
        // If unfolded...
        else
        {
            // Remove the style
            this._renderer.removeStyle(sibling, styleRule);
        }
    }

    get folded(): boolean
    {
        return this._folded;
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void
    {
        // Subscribe to config changes
        this._fuseConfigService.config
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config) => {
                this._fuseConfig = config;
            });

        // Register the sidebar
        this._fuseSidebarService.register(this.name, this);

        // Setup visibility
        this._setupVisibility();

        // Setup position
        this._setupPosition();

        // Setup lockedOpen
        this._setupLockedOpen();
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void
    {
        // If the sidebar is folded, unfold it to revert modifications
        if ( this.folded )
        {
            this.unfold();
        }

        // Unregister the sidebar
        this._fuseSidebarService.unregister(this.name);

        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next();
        this._unsubscribeAll.complete();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Setup the sidebar position
     *
     * @private
     */
    private _setupPosition(): void
    {
        // Add the correct class name to the sidebar
        // element depending on the position attribute
        if ( this.position === 'right' )
        {
            this._renderer.addClass(this._elementRef.nativeElement, 'right-positioned');
        }
        else
        {
            this._renderer.addClass(this._elementRef.nativeElement, 'left-positioned');
        }
    }

    /**
     * Setup the lockedOpen handler
     *
     * @private
     */
    private _setupLockedOpen(): void
    {
        // Return if the lockedOpen wasn't set
        if ( !this.lockedOpen )
        {
            return;
        }

        // Set the wasActive for the first time
        this._wasActive = false;

        // Show the sidebar
        this._showSidebar();

        // Act on every media change
        this._fuseMatchMediaService.onMediaChange
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => {

                // Get the active status
                const isActive = this._observableMedia.isActive(this.lockedOpen);

                // If the both status are the same, don't act
                if ( this._wasActive === isActive )
                {
                    return;
                }

                // Activate the lockedOpen
                if ( isActive )
                {
                    // Set the lockedOpen status
                    this.isLockedOpen = true;

                    // Show the sidebar
                    this._showSidebar();

                    // Force the the opened status to true
                    this.opened = true;

                    // Read the folded setting from the config
                    // and fold the sidebar if it's true
                    if ( this._fuseConfig.layout.navigation.folded )
                    {
                        this.fold();
                    }

                    // Hide the backdrop if any exists
                    this._hideBackdrop();
                }
                // De-Activate the lockedOpen
                else
                {
                    // Set the lockedOpen status
                    this.isLockedOpen = false;

                    // Unfold the sidebar in case if it was folded
                    this.unfold();

                    // Force the the opened status to close
                    this.opened = false;

                    // Hide the sidebar
                    this._hideSidebar();
                }

                // Store the new active status
                this._wasActive = isActive;
            });
    }

    /**
     * Setup the visibility of the sidebar
     *
     * @private
     */
    private _setupVisibility(): void
    {
        // Remove the existing box-shadow
        this._renderer.setStyle(this._elementRef.nativeElement, 'box-shadow', 'none');

        // Make the sidebar invisible
        this._renderer.setStyle(this._elementRef.nativeElement, 'visibility', 'hidden');
    }

    /**
     * Show the backdrop
     *
     * @private
     */
    private _showBackdrop(): void
    {
        // Create the backdrop element
        this._backdrop = this._renderer.createElement('div');

        // Add a class to the backdrop element
        this._backdrop.classList.add('fuse-sidebar-overlay');

        // Add a class depending on the invisibleOverlay option
        if ( this.invisibleOverlay )
        {
            this._backdrop.classList.add('fuse-sidebar-overlay-invisible');
        }

        // Append the backdrop to the parent of the sidebar
        this._renderer.appendChild(this._elementRef.nativeElement.parentElement, this._backdrop);

        // Create the enter animation and attach it to the player
        this._player =
            this._animationBuilder
                .build([
                    animate('300ms ease', style({opacity: 1}))
                ]).create(this._backdrop);

        // Play the animation
        this._player.play();

        // Add an event listener to the overlay
        this._backdrop.addEventListener('click', () => {
                this.close();
            }
        );
    }

    /**
     * Hide the backdrop
     *
     * @private
     */
    private _hideBackdrop(): void
    {
        if ( !this._backdrop )
        {
            return;
        }

        // Create the leave animation and attach it to the player
        this._player =
            this._animationBuilder
                .build([
                    animate('300ms ease', style({opacity: 0}))
                ]).create(this._backdrop);

        // Play the animation
        this._player.play();

        // Once the animation is done...
        this._player.onDone(() => {

            // If the backdrop still exists...
            if ( this._backdrop )
            {
                // Remove the backdrop
                this._backdrop.parentNode.removeChild(this._backdrop);
                this._backdrop = null;
            }
        });
    }

    /**
     * Change some properties of the sidebar
     * and make it visible
     *
     * @private
     */
    private _showSidebar(): void
    {
        // Remove the box-shadow style
        this._renderer.removeStyle(this._elementRef.nativeElement, 'box-shadow');

        // Make the sidebar invisible
        this._renderer.removeStyle(this._elementRef.nativeElement, 'visibility');
    }

    /**
     * Change some properties of the sidebar
     * and make it invisible
     *
     * @private
     */
    private _hideSidebar(delay = true): void
    {
        const delayAmount = delay ? 300 : 0;

        // Add a delay so close animation can play
        setTimeout(() => {

            // Remove the box-shadow
            this._renderer.setStyle(this._elementRef.nativeElement, 'box-shadow', 'none');

            // Make the sidebar invisible
            this._renderer.setStyle(this._elementRef.nativeElement, 'visibility', 'hidden');
        }, delayAmount);
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Open the sidebar
     */
    open(): void
    {
        if ( this.opened || this.isLockedOpen )
        {
            return;
        }

        // Show the sidebar
        this._showSidebar();

        // Show the backdrop
        this._showBackdrop();

        // Set the opened status
        this.opened = true;
    }

    /**
     * Close the sidebar
     */
    close(): void
    {
        if ( !this.opened || this.isLockedOpen )
        {
            return;
        }

        // Hide the backdrop
        this._hideBackdrop();

        // Set the opened status
        this.opened = false;

        // Hide the sidebar
        this._hideSidebar();
    }

    /**
     * Toggle open/close the sidebar
     */
    toggleOpen(): void
    {
        if ( this.opened )
        {
            this.close();
        }
        else
        {
            this.open();
        }
    }

    /**
     * Mouseenter
     */
    @HostListener('mouseenter')
    onMouseEnter(): void
    {
        // Only work if the sidebar is folded
        if ( !this.folded )
        {
            return;
        }

        // Unfold the sidebar temporarily
        this.unfolded = true;
    }

    /**
     * Mouseleave
     */
    @HostListener('mouseleave')
    onMouseLeave(): void
    {
        // Only work if the sidebar is folded
        if ( !this.folded )
        {
            return;
        }

        // Fold the sidebar back
        this.unfolded = false;
    }

    /**
     * Fold the sidebar permanently
     */
    fold(): void
    {
        // Only work if the sidebar is not folded
        if ( this.folded )
        {
            return;
        }

        // Fold
        this.folded = true;
    }

    /**
     * Unfold the sidebar permanently
     */
    unfold(): void
    {
        // Only work if the sidebar is folded
        if ( !this.folded )
        {
            return;
        }

        // Unfold
        this.folded = false;
    }

    /**
     * Toggle the sidebar fold/unfold permanently
     */
    toggleFold(): void
    {
        if ( this.folded )
        {
            this.unfold();
        }
        else
        {
            this.fold();
        }
    }
}
